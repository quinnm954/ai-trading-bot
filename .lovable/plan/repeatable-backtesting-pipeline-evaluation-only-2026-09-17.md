# Repeatable Backtesting Pipeline (Evaluation Only)

Build a real, re-runnable historical replay of the **current** live entry/exit logic over 60–90 days of real Coinbase candles, with every result stored in `backtest_runs`. Nothing about live trading, sizing, or the tuner changes.

## What exists today

- `backtest_runs` table exists but is empty.
- `supabase/functions/backtest-runner` is a toy: 6 hand-written toy strategies, CoinGecko 4h candles, 10 hardcoded coins, fixed 1%/2% stops, `volume: 1_000_000` faked. It shares **no** code with the live engine, so it can never validate live parameters.
- `src/pages/Backtesting.tsx` drives that toy runner.

Both get replaced by the real pipeline.

## 1. Make the live logic replayable without changing it

The engine's indicator math and candle-feature builder currently live inline in `ai-trading-engine/index.ts` (`computeRSI`, `computeEMA`, `computeBollinger`, `computeMacdHistogram`, `computeVWAP`, `computeVolumeRatio`, `hasHigherLows`, `findSupportLevel`, `classifyVol`, plus the body of `fetchCandleTechnicals`). If the backtester re-implements them it will silently drift from production and the results become worthless.

So: move them **verbatim** into two new shared modules and have the engine import them.

- `_shared/indicators.ts` — the pure indicator functions, unchanged.
- `_shared/candle-technicals.ts` — `computeCandleTechnicals(candles)`: the exact body of the engine's `fetchCandleTechnicals` **after** the network call, including the audit fixes (drop in-progress bar, `MIN_CLOSED_5M_BARS = 36`, `MAX_5M_GAP_SECONDS = 900`, Wilder RSI, timestamp-aware `change5m`/`change15m`, pivot-only support, weakness-penalising legacy score). Also `computeHtfContext(hourlyCandles)` from `fetchHtfContext`.

In the engine, `fetchCandleTechnicals` / `fetchHtfContext` become thin fetch-then-call wrappers. Pure refactor, no behaviour change — verified by `deno check` plus a live-cycle log comparison after deploy.

`_shared/exit-geometry.ts` and `_shared/entry-playbook.ts` are already shared and get imported as-is.

## 2. Historical candle cache (new tables)

Fetching 90 days of 5-minute bars for ~30 coins is ~2,300 paginated Coinbase requests — far too slow to redo on every run, and item 4 requires cheap re-runs.

- `backtest_candles` — `product_id, granularity, bucket_start, open, high, low, close, volume`, PK `(product_id, granularity, bucket_start)`. Shared reference data, readable by `authenticated`, written only by the function's service role. Holds `FIVE_MINUTE` and `ONE_HOUR` series.
- `backtest_jobs` — one row per requested run: universe, date range, parameter snapshot (JSON), phase (`syncing` → `replaying` → `done`/`failed`), progress counters, `run_group_id`, error text. Owner-scoped RLS.

Candles are fetched once, then every future run replays from the cache — a parameter change can be validated in seconds.

## 3. The replay

New edge function `backtest-replay`, actions `start`, `tick`, `status`. `tick` is chunked and resumable so no single invocation exceeds the wall-clock limit; the page polls `tick` until the job reaches `done`.

**Universe** — the same selection rule the engine uses: all online Coinbase USD/USDC spot markets, stablecoins excluded, ordered by 24h quote volume, top N (default 30, configurable). Recorded on the job.

**Bar clock** — walk the 5-minute series forward. At each bar, only closed bars at or before that timestamp are visible; every indicator is recomputed from that truncated window via the same shared code the engine calls. No future bar is ever read for a decision.

**Per bar, in production order:**
1. **Tape gate** — cross-sectional read rebuilt from the cache across the top-40 names at that timestamp: mean 24h change, mean 1h change, breadth, min 8 hourly samples. Thresholds imported from the engine's current values (`TAPE_MIN_24H_PCT = -0.5`, `TAPE_MIN_1H_PCT = -0.5`, `TAPE_MIN_BREADTH = 0.45`). Gate closed → no entries that bar, counted as a stand-down.
2. **Entry playbook** — `evaluateEntryPlaybook()` with the same input mapping as the engine's final buy gate, including `targetPct` from `solveAdaptiveGeometry`, plus the pre-playbook RSI > 75 and %B > 1.0 blocks. Tuning defaults to `PLAYBOOK_TUNING_DEFAULTS`, overridable per run.
3. **Geometry** — `solveAdaptiveGeometry(swingAtrPct, stopPct)` for stop, fee-solved target, and `holdMinutes`; `solveWideGeometry` when a run enables wide mode.
4. **Position management** — one open position per symbol, concurrency slot cap, fixed fractional sizing off a fixed capital basis (no reinvestment, matching the live rule).

**Exits**, checked per bar against that bar's high/low, in the engine's precedence: stop → target → profit lock (`solveProfitLock`: arm at 2.5× stop distance, give back 0.6× stop distance, tracked on a running peak) → max-hold expiry. When one bar's range spans both stop and target, the **stop** is taken — the pessimistic reading, since 5-minute bars can't order intrabar ticks. Recorded as an assumption on each run.

**Fees** — 0.8% round trip charged on every closed trade, same as the live assumption.

## 4. Persisted results

Every run writes to `backtest_runs`: one row per symbol plus one aggregate row (`symbol = 'PORTFOLIO'`), all tagged with a shared `run_group_id`. Existing columns carry date range, trade count, win rate, profit factor, max drawdown, balances, return, best/worst, avg win/loss. The `details` JSON carries what the columns don't:

- expectancy per trade in dollars and in %
- exit-reason breakdown: target / stop / profit-lock / max-hold expiry, count and share
- stand-down bar count and share, plus playbook veto tallies by reason
- the full parameter snapshot the run used (stop cap, tape thresholds, playbook tuning, fee, sizing)
- the intrabar tie-break assumption and the bar clock used

Per-symbol and overall are therefore both queryable, and any two runs are directly comparable.

## 5. UI

Rewrite `src/pages/Backtesting.tsx` against the new function: universe size, day range (60/90), parameter overrides for the values worth testing (stop cap, tape thresholds, playbook tuning, wide mode), a progress indicator while the job ticks, and a results view showing the portfolio summary with the per-symbol table and exit-reason breakdown underneath. Past run groups are listed so a new parameter set can be compared against the baseline.

## 6. Baseline run

Once deployed I'll sync 90 days of candles for the top 30 markets and run the replay against the **current** live parameters untouched, then report: trade count, win rate, expectancy, profit factor, max drawdown, and the target/stop/expiry split overall and per symbol — plus a straight read on whether the current setup shows an edge over 90 days.

## Explicitly out of scope

No change to `ai-trading-engine` decision logic, position sizing, the tuner, `auto-take-profit`, `risk-manager`, or any account setting. The only engine edit is the import-swap refactor in step 1, which must leave behaviour byte-identical.

## Assumptions

- Universe defaults to the top 30 Coinbase markets by volume rather than all ~230, to keep the candle sync tractable; it's a run parameter, so a wider set can be run later.
- 90 days is the target range; Coinbase 5-minute history that falls short for a young market means that symbol is replayed over whatever it has and the shortfall is recorded.
- Long-only, matching the live engine.

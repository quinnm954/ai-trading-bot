# Accuracy audit of the candle / band / support reading

The bots do check candles, Bollinger bands, support, volume and momentum before a buy. What has never been verified is whether those readings are *numerically correct*. A wrong indicator passes every rule silently — the trade looks well-graded and still loses. This plan verifies each reading against independent math and real data, then fixes whatever is off.

## What gets verified

1. **Candle data itself** — the 5-minute and 1-hour candle pulls: correct ordering (oldest to newest), enough bars for each indicator, the newest bar not being an unfinished partial candle, and gaps/missing bars on thin coins not silently producing a "0%" reading.
2. **Indicator math** — recompute RSI(14), Bollinger bands and %B, EMA9/EMA21, MACD histogram, ATR(14) and VWAP from the same raw candles using an independent reference implementation, and compare to what the engine produced for a sample of live coins. Anything off by more than a rounding difference is a bug.
3. **Support detection** — check that the support level is derived from a real swing low rather than the sample's lowest close, and that the `at_support` / `below_support` / `far_above_support` labels match what a chart shows for the same coin and window.
4. **Volume participation** — confirm the "recent volume vs its 20-bar baseline" ratio compares like with like (same bar size, baseline excluding the current bar).
5. **Coverage honesty** — the rules only run when at least 70% of the evidence is available. Measure real coverage per coin so partly-blind entries on thin coins get caught instead of scoring on fragments.
6. **Rule agreement** — one conflict already exists in the code: the older technical score still *rewards* price sitting at the lower band and a bounce off it, while the current rules exist specifically to stop buying weakness. Confirm how often that legacy bonus is what lifts a candidate into range, and remove the contradiction.

## How the check is done

- Pull the exact raw candles for ~15 live coins across liquidity tiers, run both the engine's numbers and an independent recomputation, and produce a side-by-side difference report.
- Replay the last cycles' logged candidates and record, per rule: how often it was evaluable, how often it vetoed, and how often it was the deciding factor. A rule that never fires is not protecting anything.
- Spot-check three recent losing entries end to end: what the bot read at entry versus what the candles actually showed at that timestamp.

## Then

Fix confirmed inaccuracies, remove the contradicting legacy bonus, and report the difference report plus the per-rule firing statistics so you can see which checks are genuinely doing work. No behaviour changes beyond correctness fixes without checking with you first.

## Technical notes

- Reading targets: `supabase/functions/ai-trading-engine/index.ts` (candle fetch, `computeEMA` / RSI / MACD / BB / ATR / VWAP / volume ratio / support classification, and the legacy `techScore` band bonuses around the enrichment block), `supabase/functions/_shared/entry-playbook.ts` (weights, vetoes, coverage), `supabase/functions/_shared/market-feed.ts` (1h fallback path).
- Reference recomputation runs as a throwaway script outside the app; no project files change during the verification stage.

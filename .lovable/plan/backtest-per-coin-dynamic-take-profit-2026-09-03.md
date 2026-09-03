# Backtest: per-coin dynamic take-profit

Goal: find out whether setting each coin's take-profit from its own recent volatility beats the current one-size-fits-all geometry. This is a research run only — no engine, UI, or database changes.

## What gets tested

Baselines (what we run today):
- Locked mode: +3.36% gross TP / -0.80% stop / 12-24h hold
- Wide-stop mode: +8% gross TP / 2.5x ATR stop / 48h hold

Candidates (per-symbol TP resolved at entry):
- TP = k x 5m/15m ATR%, with k swept over roughly 2 / 3 / 4 / 5
- TP = a percentile (60th / 75th / 90th) of that coin's favorable excursions over the trailing 24h
- Stop tied to the same volatility measure, sized so net reward-to-risk after the 0.8% fee round trip stays at or above 1.6:1
- TP clamped to a sane band (about 1.5% to 12%) so thin coins can't get fantasy targets

Every variant keeps the existing entry rules: aggregate tape gate, minimum 24h range and ATR thresholds, and the directional edge filter — so the only thing changing is exit geometry.

## Data and method

- Real Coinbase 15m candles, 60 days, the same ~14 USD pairs used in earlier runs
- Volatility measured only from data available before each entry (no lookahead)
- Chronological train/test split, walk-forward, with fees and slippage charged on both legs
- Per-variant and per-symbol output: trade count, win rate, expectancy per trade, profit factor, max drawdown, and how often TP was actually reached versus the stop or the hold expiry

## Decision rule

A variant only moves forward if it is positive on expectancy in the held-out period, keeps net R:R at 1.6:1 or better, and produces enough trades to be meaningful. If the sweep is negative everywhere, the answer is that dynamic TP doesn't fix it and we report that plainly rather than shipping it.

## Deliverable

A results table comparing every variant against both current baselines, plus a per-symbol breakdown and a clear recommendation. If a variant wins, a follow-up plan covers wiring per-symbol geometry into the engine and storing the resolved TP/stop on each position at entry.

No profit is guaranteed by any of this — it only tells us which geometry survived on historical data.

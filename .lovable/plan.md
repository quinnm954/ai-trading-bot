# Add stock/equities trading alongside crypto

Goal: an account can trade crypto (Coinbase, exactly as today) or US stocks (Alpaca), and whichever is selected works end to end. Crypto behaviour is untouched — every stock path is a new branch, never an edit to the crypto branch.

## Two facts I checked first

- The $25,000 pattern-day-trader minimum and the "pattern day trader" label were removed effective June 4, 2026, replaced by a risk-based intraday margin standard; brokers may phase in until October 20, 2027. The separate $2,000 margin minimum and 25% maintenance margin still apply. So the warning component gets rewritten, not restored.
- Alpaca's shape is unchanged since the old code: trading at `api.alpaca.markets/v2` (paper at `paper-api.alpaca.markets/v2`), stock market data at `data.alpaca.markets/v2/stocks/...`, key/secret headers. The old client is a usable reference; I'll modernise error handling, rate-limit backoff, and fractional/notional order handling rather than copy it.

## Phase 1 — Market mode as a real setting

- Add `ai_settings.market_mode` ('crypto' | 'stocks', default 'crypto') plus stock-specific columns (stock exit geometry bounds, market-hours flag). Existing accounts stay 'crypto'.
- `allowed_markets` becomes the source of truth for what the scanner may consider; new accounts keep `['crypto']`.
- Store Alpaca keys per user in the existing `broker_credentials` table (provider `alpaca`, paper flag) — same pattern as Coinbase, keys stay user-owned.

## Phase 2 — Alpaca integration (rebuilt)

New `supabase/functions/_shared/alpaca.ts`:
- account (equity, buying power, cash, margin state), positions, place/cancel order, latest quote/trade, snapshot.
- Paper vs live base URL from the credential's paper flag.
- Retry with backoff and bounded concurrency, matching what the Coinbase feed already does.
- Quantity/notional rounding per asset (whole shares vs fractional where the asset allows).
- `test-broker-connection` and `sync-broker-balances` gain an Alpaca branch so balances and positions reconcile like Coinbase does.

## Phase 3 — Stock data provider

New `supabase/functions/stock-data-provider`:
- historical bars and latest quotes from Alpaca market data, with a fallback path if a symbol has no bars.
- market calendar from Alpaca's clock/calendar endpoints (real holidays and early closes, no hard-coded list), exposed as `isMarketOpen`, `minutesToClose`, `nextOpen`.
- Adds a `stocks` branch to `_shared/market-feed.ts` behind the same interface the engine already consumes, so the engine's candle/indicator code is reused unchanged.

## Phase 4 — Branching in the engine

In `ai-trading-engine`, `auto-take-profit`, `_shared/entry-playbook.ts`, `_shared/tape-gate.ts`, `_shared/exit-geometry.ts`:
- one `assetClass` value threaded through the cycle; crypto keeps today's constants byte-for-byte.
- Stocks get:
  - Market-hours gate: no entries outside regular hours; no new entries in the last ~15 minutes; exits still permitted while open. Overnight positions held, not force-closed.
  - Own exit geometry module tuned to equity volatility (daily-ATR based, tighter stop/target band than crypto, its own hold window), solved with **zero commission** — no 0.8% round-trip. Slippage/spread allowance only.
  - Own tape gate using a broad-market proxy (index ETF trend + breadth of the stock universe) instead of the crypto top-40 tape.
  - Universe: liquid, price-filtered, tradable US equities/ETFs from Alpaca's asset list, dollar-volume ranked.
- Intraday margin guardrails replacing PDT counting: block entries that would exceed a configured intraday exposure ceiling, require the $2,000 margin floor before margin use, and keep a cash-account mode that avoids margin entirely. Day-trade counting is removed as a blocker but still surfaced informationally.

## Phase 5 — Fees

`close-trade` and both exit paths take a fee model per asset class: crypto keeps 0.8% round trip; stocks use 0 commission plus a small slippage estimate. Expectancy, P&L, and backtests all read the same model.

## Phase 6 — Backtesting for stocks

Extend `backtest-replay`:
- Alpaca bars ingestion into the existing candle cache (keyed so crypto and stock rows don't collide).
- session-aware replay (no bars overnight/weekends), stock exit geometry, zero-commission fee model, stock tape gate.
- runs persist to `backtest_runs` with the same metrics, so stock variants are comparable the way crypto variants now are.

## Phase 7 — UI

- Per-account Crypto / Stocks toggle on the Risk (settings) page, with a clear note that stocks require Alpaca keys and trade only during market hours.
- Broker connection screen gains Alpaca (key, secret, paper/live).
- Dashboard, positions, wallet/balance cards read the active mode: correct currency/symbol formatting, market-open indicator and next-open countdown for stocks.
- `PDTWarning.tsx` rewritten as an intraday-margin notice: explains the June 2026 change, shows the account's intraday exposure vs ceiling and margin eligibility, and warns if the connected broker hasn't phased the new framework in yet.

## Order of work and safety

Phases 1→3 first (schema, broker, data), then 4→5 (engine branching, fees), then 6 (backtest), then 7 (UI). Stocks stay off for every existing account until explicitly switched, and no stock money moves until a backtest run over stock bars is on record. Crypto regression check after each phase: same gates, same geometry, same fee math, unchanged trade behaviour.

## Assumptions (tell me if wrong)

- Users supply their own Alpaca keys (same model as Coinbase) rather than the app operating a Broker API relationship.
- One asset class active per account at a time (a toggle), not both simultaneously.
- Stocks are long-only to start — no shorting, no options.

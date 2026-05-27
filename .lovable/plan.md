## What exists today
- Regime detection, strategy switching, leverage trading, per-trade liquidation estimates, basic `grid` strategy, basic volatility (24h range).

## What I'll add

### 1. Dynamic Grid Strategy
Replace the always-enter grid with an ATR-tuned grid that adapts to current range and regime.

- New helper `computeDynamicGrid(symbol, priceHistory, regime)` in `ai-trading-engine`:
  - Compute ATR(14) and recent high/low range
  - Grid spacing = `ATR × multiplier` (multiplier: 0.5 in low-vol, 1.0 ranging, 1.5 high-vol)
  - Number of levels = clamp(range / spacing, 3, 12)
  - Center grid on VWAP / mid-price
- Only activates when regime is `ranging` or `low_volatility` (best fit for grids)
- Auto-rebalance: if price breaks ±2× ATR outside grid bounds, the engine recomputes the grid on next cycle
- Persist active grid layout in a new table `grid_layouts` (symbol, levels jsonb, spacing, regime, updated_at) so the UI can visualize it

### 2. Liquidation-Map Analysis (hybrid)
Aggregate liquidation clusters and bias the AI toward fade zones / away from magnets.

- New table `liquidation_map` (symbol, price_level, side, cluster_size_usd, source, updated_at)
- New edge function `liquidation-map-scanner` (cron every 5 min):
  - **Internal**: scan all open `positions` + `futures_positions` + their leverage to compute implied liq prices; bucket into price bins per symbol
  - **External (toggleable)**: optional Coinglass-style API — gated behind a new `LIQUIDATION_API_KEY` secret. If absent, internal-only mode works fine.
- AI integration in `ai-trading-engine`:
  - Pre-trade check: if entry is within 0.5% of a large opposite-side liq cluster (magnet risk), reduce size 50% or skip
  - Take-profit nudge: if a same-side cluster sits just above entry, set TP just below it (price tends to wick to liquidations)
- UI: new `LiquidationMapCard` on `CryptoSignals.tsx` showing top clusters per symbol as a horizontal heatmap

### 3. Dynamic Leverage Scaling
Make `leverage_settings.max_leverage_cap` an upper bound, with effective leverage scaled by volatility + regime.

- New helper `computeEffectiveLeverage(regime, atrPct, userCap)`:
  - `high_volatility` or `news_driven` → effective = min(userCap, 2)
  - `trending` + low ATR% → effective = userCap
  - `ranging` → effective = min(userCap, userCap × 0.6)
  - `low_volatility` → effective = userCap (but small position sizes)
- Wire into `LeverageTrading.tsx` calculator and into any leverage-aware trade sizing in `ai-trading-engine`
- Show "Effective leverage now: Nx (capped by {reason})" badge on the Leverage page

### 4. Shared volatility signal
Centralize ATR / volatility classification in a single helper (`computeVolatilityProfile`) used by all three features and by regime detection, so they stay consistent.

## Files

**New**
- `supabase/functions/liquidation-map-scanner/index.ts`
- `src/components/trading/LiquidationMapCard.tsx`
- `src/hooks/useLiquidationMap.ts`
- `src/lib/volatility.ts` (shared ATR / vol-profile helper, mirrored in edge function inline)

**Modified**
- `supabase/functions/ai-trading-engine/index.ts` — dynamic grid, liq-map pre-trade check, effective leverage
- `supabase/functions/ai-learning-engine/index.ts` — use shared vol profile
- `src/pages/LeverageTrading.tsx` — effective-leverage display + use in calculator
- `src/pages/CryptoSignals.tsx` — mount `LiquidationMapCard`
- `supabase/config.toml` — schedule `liquidation-map-scanner` (cron) if needed

**Migrations**
- `grid_layouts` table (user_id, symbol, levels jsonb, spacing, center_price, regime, updated_at) + RLS + GRANTs
- `liquidation_map` table (symbol, price_level, side, cluster_size_usd, source, updated_at) — public-read, service-role write + GRANTs

## Secrets
- Optional `LIQUIDATION_API_KEY` — only requested if/when you want external data live. Internal mode ships working without it.

## Out of scope
- No changes to existing live execution loop, risk-manager kill-switch, or paper-trading defaults.
- No new strategies beyond the dynamic-grid upgrade.
- No UI redesign of `LeverageTrading.tsx` beyond the effective-leverage badge.

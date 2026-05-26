## Goal
Fix the four inefficiencies observed in the last 1.5h of scalp activity:
1. Same-symbol re-entries (TON, FIL, INJ, ATOM all duplicated)
2. Trailing stop too loose — winners (RENDER +1.46%, ATOM +1.06%) not booking
3. Position sizes too large (~$8–16k each → 80%+ concentration)
4. No hard take-profit — gains can fully reverse

All changes apply to **both paper and live** (same code path; `isPaperMode` only differs at the broker-call layer).

## Changes

### 1. `supabase/functions/ai-trading-engine/index.ts`

**a. Stronger duplicate guard (line ~16, ~2873–2892)**
- Bump `DUPLICATE_TRADE_COOLDOWN_MINUTES` from `5` → `15`.
- In addition to the existing "skip if symbol already open" check, add a **price-proximity guard**: if the most recent closed trade for this symbol was within 30 minutes AND the current entry price is within 0.5% of that exit price, skip with `🧯 SKIP chase: exited ${exitPrice}, now ${currPrice}`.

**b. Hard per-scalp cap (line ~2895–2916)**
- After computing `tradeValue`, clamp:
  ```ts
  const SCALP_MAX_POSITION_PCT = 5;            // 5% of equity hard cap
  const equityCapValue = (balance + openPositionsValue) * (SCALP_MAX_POSITION_PCT / 100);
  tradeValue = Math.min(tradeValue, equityCapValue);
  quantity   = tradeValue / coinData.price;
  ```
- Reduces ~$15k positions on a $100k account to ~$5k each.

**c. Cap concurrent scalps**
- When computing `remainingSlots` (line ~2674), use `Math.min(settings.max_concurrent_trades, 5)` for scalp mode so the bot never exceeds 5 simultaneous scalps even if the user setting is higher.

### 2. `supabase/functions/auto-take-profit/index.ts`

**a. Tighten trailing stop (lines 17–22)**
- `TRAILING_STOP_MIN_PEAK`: `1.5` → `0.8` (arm trail at +0.8% instead of +1.5%)
- `TRAILING_STOP_DROP`: `0.7` → `0.5` (exit on 0.5% giveback instead of 0.7%)
- `ROTATION_PROFIT_THRESHOLD`: keep `1.5`

**b. Add hard take-profit (~line 1163–1177)**
- New constant `HARD_TAKE_PROFIT_PCT = 1.8` (1.8% gross ≈ 0.6% net after ~1.2% round-trip fees).
- Trigger sell when `currentPnlPct >= HARD_TAKE_PROFIT_PCT`, regardless of peak/trail state. Log as `decision_type = 'hard_tp'`.

## Result expected
- Winners book in ~1.0–1.8% windows instead of riding back to flat
- Same-symbol thrash (TON re-buy at $2.04 after $2.04 exit) is blocked
- Worst case loss per scalp: ~$100 on $5k position at -2% stop (vs ~$300+ today)
- Total exposure capped at ~5 positions × 5% = 25% of equity (vs 80%+ today)

## Files touched
- `supabase/functions/ai-trading-engine/index.ts`
- `supabase/functions/auto-take-profit/index.ts`

No DB migrations, no UI changes. Live and paper share these parameters automatically.
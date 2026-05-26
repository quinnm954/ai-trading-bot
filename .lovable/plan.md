## Goal

When a strong new scalp candidate appears but we're out of slots/capital, close the weakest losing position (within a small loss cap) to free room — so red bags stop blocking better setups.

## Trigger conditions (ALL must be true)

1. `ai-trading-engine` has at least one tradeable candidate that passed the new short-window momentum gate (5m+1h+24h all positive).
2. Either: open trade slots are at `max_concurrent_trades`, **or** free USDC < required trade size (`MIN_TRADE_VALUE` + buffer).
3. There exists an open position whose:
   - `unrealized_pnl_pct` is between **−2%** (user cap) and **0%** (only swap reds, never winners), AND
   - live momentum is weaker than the new candidate's 5m change by a clear margin (candidate 5m ≥ position 5m + 0.5 percentage points), AND
   - position is at least 5 minutes old (avoid swapping a fresh entry on a single tick).
4. New candidate is materially stronger: 5m ≥ +0.3% and 1h ≥ +0.3%.
5. No swap was performed for this user in the last 60 seconds (per-user cooldown to prevent thrash).

If multiple positions qualify, pick the **weakest** (most negative pnl%, or lowest 5m momentum if tied).

## Implementation

### `supabase/functions/ai-trading-engine/index.ts`

In the autonomous trading loop, **after** candidate selection and **before** the "no slots / insufficient capital" early-return:

1. Detect blocked state (slots full or cash too low) and that we have a viable candidate.
2. Load open positions for the user (current `is_paper` mode) with their `peak_pnl_percent`, `avg_entry_price`, `quantity`, `symbol`, `created_at`.
3. For each, compute current pnl% from the already-fetched marketData price; fetch (or reuse cached) 5m candle momentum via the same `fetchShortWindowMomentum` helper added in the previous change.
4. Apply the 5-rule filter above; if a swap candidate exists, call the same exit code path used by `auto-take-profit` rotation — extracted into a shared helper `closePositionForRotation(position, reason)` that:
   - Logs an `ai_decisions` row with `decision_type = 'loss_rotation'` and the reason (`"swap → SYM: candidate 5m +0.8% vs held 5m -0.2%, realized −0.6%"`).
   - Executes the sell (live: Coinbase market sell; paper: credit cash).
   - Updates `positions` row (status closed / quantity 0) and inserts a `trades` row with `pnl < 0`.
   - Inserts a `risk_events` row `event_type='loss_rotation'`, `severity='info'`.
5. After successful close, **continue** the loop so the freed capital is immediately used for the new entry in the same tick.

### Shared exit helper

`auto-take-profit/index.ts` already has the sell-and-record logic inline (around line 1190–1325). Extract the closing block (price fetch already done, sell call, position update, trade insert, decision log) into a small exported function `closePositionToCash(position, reason, decisionType)` so the new ai-trading-engine path reuses it instead of duplicating. Both files live in `supabase/functions/_shared/` already — add `_shared/closePosition.ts`.

### Settings & defaults

- `MAX_LOSS_ROTATION_PCT = -2.0` (user-chosen)
- `LOSS_ROTATION_COOLDOWN_SEC = 60`
- `LOSS_ROTATION_MIN_AGE_SEC = 300`
- `LOSS_ROTATION_MOMENTUM_EDGE_PCT = 0.5` (candidate 5m must beat held 5m by this much)

Hard-code for now; expose in Risk Settings later if useful.

### Logging / visibility

Every swap writes:
- `🔁 LOSS ROTATION: closing SYM @ -0.6% to free $7 for NEWSYM (5m +0.8% vs -0.2%)` to function logs.
- `ai_decisions` row visible in the AI Decisions feed.
- `risk_events` row visible in Risk page.

### Verify

1. Manually invoke `ai-trading-engine` with the current 4 stuck-red live positions and confirm a new strong candidate triggers exactly one swap (not multiple), realized loss ≤ 2%, and the freed cash is used for the new entry in the same run.
2. Confirm `risk_events` shows the swap with full context.
3. Confirm no swap fires when free cash already exists.
4. Confirm no swap fires when no candidate beats held positions by the momentum edge.

## Files touched

- `supabase/functions/ai-trading-engine/index.ts` — add loss-rotation block before the "blocked / out of room" return path.
- `supabase/functions/auto-take-profit/index.ts` — extract sell-and-record into shared helper (small refactor, behavior unchanged).
- `supabase/functions/_shared/closePosition.ts` — new helper.

No DB schema, no UI changes.

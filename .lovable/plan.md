## Goal

Let you flip between Paper and Live at any time. The bot should keep running, immediately start scanning in the new mode, and never get auto-disabled by the switch itself.

## What's already working

- Each mode has its own positions, trades, balance, and daily-loss tally (filtered by `is_paper`), so switching modes naturally exposes a fresh budget.
- The trading engine only gates on `settings.enabled` (not `bot_status` or `trading_mode`), so a mode flip alone doesn't stop trading.
- The frontend loop in `useAITraderData` re-runs the engine every 30s and take-profit checker every 5s based on `enabled`.

## What's fragile today

1. `setTradingMode('live')` **hard-refuses** the switch when no broker is connected — toast appears and nothing changes. You can't toggle to live to inspect or pre-configure.
2. After a `trading_mode` write, the next engine tick is up to 30s away — feels like trading "stopped" momentarily.
3. If the daily-loss limit tripped in one mode, `bot_status` was flipped to `idle` (cosmetic only, but the UI badge reads "Idle" even though the other mode is still tradable).
4. No visible confirmation in the UI that the bot is still active after a switch.

## Changes

### `src/hooks/useAITraderData.ts`
- `setTradingMode(mode)`:
  - Keep `enabled` and `bot_status: 'trading'` untouched (or re-assert `'trading'` if currently `'idle'` from a prior daily-loss in the *other* mode).
  - For `mode === 'live'` with no connected broker: keep the warning toast but **still allow the switch** so the user can prep. Add a secondary toast clarifying that live trades will be skipped until a broker is connected (engine already no-ops without keys).
  - Immediately call `runTradingEngine()` and `runTakeProfitChecker()` after the update so the new mode kicks in instantly instead of waiting for the next 30s tick.
- Add a tiny `isSwitchingMode` flag for UI feedback (optional polish).

### `supabase/functions/ai-trading-engine/index.ts`
- When the daily-loss limit trips, scope the `bot_status: 'idle'` write to be informational only — do **not** set it if the *other* mode still has budget. Simplest fix: stop writing `bot_status` here entirely and rely on `enabled` (which we leave alone). This prevents a Paper loss from making the UI look paused in Live and vice-versa.
- No other engine changes — the per-mode `is_paper` filters already isolate balances, positions, daily loss, and cooldowns.

### `src/components/trading/` (light UI)
- The mode toggle should reflect that flipping is non-blocking. Keep the existing toggle component; just remove any disabled state tied to "no broker" so the switch is always clickable.

## Out of scope

- No changes to risk filters, price band ($0.10–$2), uptrend rules, or cooldowns.
- No changes to live execution (Coinbase) — if keys aren't present, live mode still safely skips real orders.
- No DB schema changes.

## Result

Toggle Paper ↔ Live anytime → bot stays `enabled`, engine re-runs within a second in the new mode, each mode keeps its independent capital and loss budget, and the UI never falsely shows "Idle" because the other mode hit a limit.
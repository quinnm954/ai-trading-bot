## Goal
Let users tune the scalp engine's entry, exit, loss-rotation, and sizing parameters from a new panel on the Risk page, with one-click presets and an advanced expandable section for manual sliders. Currently these are hardcoded constants in `ai-trading-engine/index.ts` and `auto-take-profit/index.ts`.

## What gets added

### 1. New table: `scalp_settings` (one row per user)

Columns (all numeric/float unless noted):

- `user_id` (uuid, unique)
- `preset` (text: 'conservative' | 'balanced' | 'aggressive' | 'custom', default 'balanced')
- **Entry momentum thresholds**
  - `entry_min_5m_pct` (default 0.3)
  - `entry_min_15m_pct` (default 0.2)
  - `entry_min_1h_pct` (default 0.3)
  - `entry_min_24h_pct` (default 0.3)
  - `reentry_breakout_pct` (default 0.25)
  - `chase_guard_minutes` (int, default 120)
- **Exit / trailing stop**
  - `take_profit_pct` (default 1.0) — peak gain that arms trailing stop
  - `trailing_drop_pct` (default 1.5) — drop from peak that triggers exit
  - `hard_stop_loss_pct` (default 3.0)
  - `momentum_rotation_min_pct` (default 0.5) — profit-realization rotation threshold
- **Loss-rotation**
  - `loss_rotation_enabled` (bool, default true)
  - `loss_rotation_max_loss_pct` (default -2.0)
  - `loss_rotation_momentum_edge_pct` (default 0.5)
  - `loss_rotation_min_age_sec` (int, default 300)
  - `loss_rotation_cooldown_sec` (int, default 60)
- **Sizing & slots**
  - `max_concurrent_positions` (int, default 12)
  - `target_position_size_usd` (default 50)
  - `max_capital_usage_pct` (default 80)
- `updated_at`

RLS: user can SELECT/INSERT/UPDATE own row; no DELETE. GRANTs to `authenticated` and `service_role`. Auto-seed via trigger on first auth-user setup (extend `handle_new_user_setup`).

### 2. Preset values

| Knob | Conservative | Balanced | Aggressive |
|---|---|---|---|
| entry_min_5m_pct | 0.5 | 0.3 | 0.15 |
| entry_min_1h_pct | 0.5 | 0.3 | 0.15 |
| take_profit_pct | 1.5 | 1.0 | 0.6 |
| trailing_drop_pct | 1.0 | 1.5 | 2.0 |
| hard_stop_loss_pct | 2.0 | 3.0 | 4.0 |
| loss_rotation_max_loss_pct | -1.0 | -2.0 | -3.0 |
| max_concurrent_positions | 6 | 12 | 20 |
| target_position_size_usd | 25 | 50 | 100 |

Selecting a preset overwrites the rows; editing any slider switches `preset` to `'custom'`.

### 3. Frontend: `src/components/risk/ScalpSettingsPanel.tsx`

- Header card with preset buttons (Conservative / Balanced / Aggressive / Custom badge)
- Three collapsible sections under an "Advanced" toggle:
  - Entry thresholds (sliders)
  - Exit / trailing stop (sliders)
  - Loss rotation (switch + sliders)
  - Sizing & slots (sliders)
- "Reset to preset defaults" button per section
- Saves via `supabase.from('scalp_settings').upsert(...)`; debounced
- Mount on `src/pages/RiskManagement.tsx` above the existing `RiskSettingsPanel`

### 4. Backend wiring

In `supabase/functions/ai-trading-engine/index.ts` and `supabase/functions/auto-take-profit/index.ts`:

- At the start of each user's run, fetch `scalp_settings` row (fallback to defaults if missing)
- Replace hardcoded constants (`ENTRY_CONFIRM_MIN_5M_PCT`, `ENTRY_CONFIRM_MIN_15M_PCT`, `ENTRY_CONFIRM_MIN_24H_PCT`, `REENTRY_BREAKOUT_CONFIRM_PCT`, `CHASE_GUARD_WINDOW_MINUTES`, `MAX_LOSS_ROTATION_PCT`, `LOSS_ROTATION_COOLDOWN_SEC`, `LOSS_ROTATION_MIN_AGE_SEC`, `LOSS_ROTATION_MOMENTUM_EDGE_PCT`, and take-profit/trailing-stop values) with values from the settings row
- Gate `tryLossRotation` behind `loss_rotation_enabled`
- Use `max_concurrent_positions`, `target_position_size_usd`, `max_capital_usage_pct` for slot/sizing decisions (keep `ai_settings.max_concurrent_trades` as a hard cap — take the min)

### 5. Memory

Add `mem://ui/scalp-settings-panel` summarizing that the Risk page is the single source of truth for adjustable scalp params, and update `mem://ui/risk-settings-as-single-source-of-truth` reference.

## Verification

- Migration applies cleanly; new row auto-seeds for new signups; manual upsert works for existing users
- Risk page renders panel, sliders persist, preset buttons overwrite values
- Edge function logs show `scalp_settings loaded: { ... }` and use the user's values (test by changing a threshold and watching next decision)
- Default values match current hardcoded behavior so no regression for users who never touch it

## Out of scope

- No changes to live/paper mode toggle, kill switch, or risk-tolerance profile (those stay on existing Risk panel)
- No per-symbol overrides (single global scalp config per user)

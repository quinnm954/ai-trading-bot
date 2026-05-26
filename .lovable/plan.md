## Goal

Lock the bot to **scalping-only** and add a lightweight **paper replay** verifier you can run before enabling live paper trades. Skip the multi-strategy backtester entirely (no `backtest_runs` table, no hard gate UI for RSI/EMA/Grid/DCA/custom).

## Scope: what to remove vs keep

The codebase has strategy names (`rsi`, `ema_crossover`, `grid`, `dca`, `macd`, `trend_breakout`, `volatility_breakout`, `custom`) wired into ~20+ files including the AI engine, learning engine, advisor, DB seed function, and UI. Physically deleting every reference would shred the bot.

**Pragmatic approach:** route everything through scalping, hide the rest from the user, leave dormant code paths in place so nothing breaks.

### Remove (user-visible)
- `src/pages/Strategies.tsx` — delete page + route + sidebar link
- `src/pages/AILearningEngine.tsx` strategy comparison table — replace with "Scalping only" notice
- Strategy picker / selector UI in Settings, AI Advisor, Risk Management — replace with read-only "Strategy: Scalping" label
- Any "choose strategy" controls in onboarding / dashboards

### Keep but force to scalping
- `ai-trading-engine` edge function — short-circuit strategy selection to always return `scalping`
- `ai-learning-engine` — only update the scalping row
- `handle_new_user_setup` DB function — seed only one row in `strategy_performance` (`scalping`) for new users
- `strategy_performance` table — keep schema, just stop writing other rows

### Skip entirely
- No `backtest_runs` table, no backtester edge function, no hard gate on bot enable

## New: Scalping Paper Replay

A single edge function `scalping-replay` + a small panel on the **Risk Management** page.

**Function:** `supabase/functions/scalping-replay/index.ts`
- Input: `{ symbol: string, lookbackMinutes?: number }` (default 1440 = 24h)
- Fetches 1-minute klines from Binance public API (`/api/v3/klines`, no key)
- Runs the **exact same scalping entry/exit logic** the live bot uses (trailing stop 1% peak / 1.5% drop, 0.5% min momentum, fee-aware) bar-by-bar
- Returns: `{ trades, winRate, totalPnlPct, maxDrawdownPct, avgHoldMinutes, sampleTrades[] }`
- Persists nothing — pure in-memory one-shot

**UI:** `src/components/risk/ScalpingReplayPanel.tsx`
- Symbol input (default BTCUSDT), lookback selector (1h / 24h / 7d)
- "Run replay" button → calls edge function → renders metrics + last 10 trades table
- Plain advisory readout. No bot gating.

## Files

**Delete:**
- `src/pages/Strategies.tsx` (+ route in `src/App.tsx`, sidebar entry)

**Edit:**
- `src/App.tsx` — drop `/strategies` route
- `src/components/layout/Sidebar.tsx` — drop Strategies link
- `src/pages/AILearningEngine.tsx` — collapse to scalping-only view
- `src/pages/Settings.tsx`, `src/pages/AIAdvisor.tsx`, `src/pages/RiskManagement.tsx` — replace strategy selectors with static "Scalping" label; mount `ScalpingReplayPanel` on Risk page
- `supabase/functions/ai-trading-engine/index.ts` — force `strategy = 'scalping'`
- `supabase/functions/ai-learning-engine/index.ts` — only touch scalping row
- `supabase/functions/ai-strategy-advisor/index.ts` — only advise on scalping entries
- DB migration: rewrite `handle_new_user_setup` to seed only `('scalping', 'all_regimes', ...)` in `strategy_performance`

**Create:**
- `supabase/functions/scalping-replay/index.ts`
- `src/components/risk/ScalpingReplayPanel.tsx`

## Out of scope (per your call)

- No `backtest_runs` table
- No multi-strategy comparison UI
- No hard gate blocking the bot until a backtest passes — replay is advisory only
- No changes to live execution / Coinbase logic
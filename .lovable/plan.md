## Goal
Stop the paper account from bleeding and make it net-positive on a rolling basis. Focus on the three concrete failure modes visible in your trade history and edge-function logs.

## Root causes (from your data)
1. The `custom` strategy entered positions at stale/seed prices (ETH $3,100, XRP $2.05, SOL $130, BTC $90k) and closed at real market prices, producing five trades that lost a combined **~$595**.
2. Winners average **+1–3%** but losers run **−15% to −35%** — one loss wipes out ~10 wins.
3. The trading engine's parabolic/low-price filters leave only ~1 candidate per cycle, so the bot is starved of good setups and reaches for low-quality ones.

## Fixes

### 1. Kill the broken `custom` strategy path
- In `supabase/functions/ai-trading-engine/index.ts`, disable any code path that opens trades tagged `strategy: 'custom'` until rewritten.
- Add a guard: **reject any order whose entry price differs from the live CoinGecko price by more than 1.5%** (prevents stale-price entries from ever filling).

### 2. Enforce a hard −2% stop-loss on every open position
- In `supabase/functions/auto-take-profit/index.ts`, add a per-position **hard stop at −2%** from entry. No exceptions for "custom" or untagged strategies.
- Keep the existing +2% take-profit and trailing-stop logic.
- Cap any single realized loss at roughly **0.2% of equity** (≈ −$200 on a $100k account) — if a position would exceed that, force-close it.

### 3. Reset the loss-skewed risk profile
- Current setting: `max_daily_loss: 5%` is too loose — one bad day = $5k drawdown. Lower the default to **2%** for the moderate profile.
- Add a "smart cooldown": after 2 consecutive losing trades in a 1-hour window, pause new entries for 30 minutes (the cooldown infra already exists per memory).

### 4. Relax the dip-only filter when no candidates qualify
- Today's log shows `Tradeable (dips only): 1`. When the dip pool is `< 3`, allow **mild-momentum buys (+1% to +4% 24h change)** with a tighter position size (half normal) so the bot has real setups to choose from instead of forcing a weak trade.

### 5. Close out the stale `custom` open positions safely
- One-time cleanup: mark any still-open `custom` trades with stale entry prices as closed at current market, log the realized P&L, and stop the bleed.

## What I will not change
- No payment-flow code (Cash App work stays as-is).
- No UI changes — risk panel and dashboard already surface everything we need.
- No live-trading changes; this is paper-only tuning.

## Technical details
- Files: `supabase/functions/ai-trading-engine/index.ts`, `supabase/functions/auto-take-profit/index.ts`, one migration to update default `max_daily_loss` in `ai_settings` for existing rows + the `handle_new_user_setup` function.
- Data cleanup runs as a single SQL update wrapped in the migration (no app-code reset needed).
- Expected behavior after deploy: max single-trade loss ≈ −$200 instead of −$117…−$595; bot opens 3–8 trades/day instead of starving; winners and losers roughly symmetric so the +/− ratio of your strategies (already > 50% win rate on `ema_crossover`) can compound.

## Honest caveat
No bot is guaranteed to be profitable — markets shift. These changes remove a *bug* and an *asymmetric loss rule* that were mathematically guaranteeing losses. After this, profitability depends on real strategy edge, and we'll iterate based on the next batch of trades.

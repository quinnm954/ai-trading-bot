
# Simplify to a single market scalper

You want one thing: a bot that scalps the market. No strategy picker, no "moonshot vs trend vs breakout" menus. Here's what I'd do.

## What gets removed (UI)

- **Strategies page / strategy selector** — hide the route and nav entry (Sidebar + BottomNav).
- **Moonshot Scanner page** — hide route + nav entry.
- **Strategy Advisor card / "best opportunity" recommendation UI** on the dashboard.
- **Any "choose a strategy" toggles** in Risk Management / Settings — keep only risk tolerance + kill-switch.
- **Learning Engine UI** — keep the backend running silently, just hide the page (it still tunes scalper params in the background).

Nothing is deleted from the codebase — routes and components stay so we can restore later — they're just unmounted from navigation and the router.

## What stays / becomes the only strategy

A single hardcoded scalper using the parameters already tuned in `supabase/functions/auto-take-profit/index.ts`:

- TP rotation threshold: **1.0%**
- Stop loss: **-1.5%**
- Trailing stop: activate at **+0.6%** peak, exit on **0.5%** drop from peak
- Entry filter: existing trend filter + 6h cooldown + parabolic/crash skip + $1 min price + duplicate guard
- Fee-aware: maker-only limit orders (already in place)
- Universe: existing top-50 CoinGecko crypto list
- Mode: paper/live toggle stays (that's not a "strategy", it's an execution mode)

## What stays in Risk Management

Only the things that actually protect capital:
- Risk tolerance profile (Conservative / Balanced / Aggressive / Custom) — drives position size + daily-loss limit
- Daily loss kill-switch
- Max drawdown kill-switch
- Per-trade size cap

Everything else (strategy weights, regime overrides, moonshot toggle, advisor toggle) gets hidden.

## Dashboard after

- Equity / cash / positions
- Open positions list
- Recent trades
- Milestone progress
- Bot status: **Idle / Scanning / Trading** (no strategy name shown)

## Files I'd touch (UI only, no business-logic deletion)

- `src/components/layout/Sidebar.tsx` — remove Strategies, Moonshot, Learning Engine, Advisor links
- `src/components/layout/BottomNav.tsx` — same
- `src/App.tsx` (or wherever routes live) — comment out those routes
- `src/pages/RiskManagement.tsx` — hide strategy/advisor/moonshot sections
- `src/pages/Index.tsx` (dashboard) — remove StrategyAdvisor card and any "current strategy" badge

Backend edge functions (`auto-take-profit`, scanner, learning engine) are **not touched** — they already implement the scalper and will keep running.

## One question before I build

Do you want me to:

**A.** Hide the pages/nav only (fastest, fully reversible, code stays)
**B.** Hide nav + also rip the strategy-selection logic out of the backend so there's literally one code path

I recommend **A** — same user experience, zero risk of breaking the running bot.

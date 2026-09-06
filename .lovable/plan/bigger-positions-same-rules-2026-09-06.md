# Bigger positions, same rules

Goal: lift daily return above ~1% by putting more money to work per trade — without touching the market safety gate, the number of trades, or the profit/loss targets.

## What's actually limiting the return today

Checked the two live paper accounts right now:

- Account A: 6 open trades, $29,547 at work out of a $100,000 base — 29.5%
- Account B: 8 open trades, $45,847 at work out of a $100,000 base — 45.8%

The rules already allow up to 12.75% of the base per trade and 85% of the base at work in total. Actual trades are coming in around 5–6% each, so roughly half the allowed money is sitting idle. That idle half is the missing return: same win rate, same targets, just less money on each winner.

## The change

1. **Size qualified trades at the allowed cap.** Remove the extra shrink factors that scale a trade down below the cap (confidence multiplier and the model's own smaller suggested size). If a setup passes every existing filter, it gets the full allowed per-trade amount.
2. **Add a sizing floor.** No qualified trade is opened below a set share of the base, so small odd-sized trades stop diluting the day.
3. **Keep the total ceiling exactly where it is.** 85% of the base at work, 12 trades max. This is what keeps things steady — bigger individual trades, but never more total money exposed than today's rules already permit.
4. **Leave untouched:** the 65% market-breadth gate, the 5% profit target, the 1.2–3.5% stop band, the 48-hour hold, cooldowns, and the loss/drawdown kill switch.

## What to expect

Money at work goes from ~30–46% of the base toward the ~85% ceiling. Because the profit target and stop distance per trade are unchanged, both good and bad days scale by roughly the same factor — around 1.8x to 2.5x. Winners get bigger; so do losing days, in the same proportion. The daily loss limit and kill switch still cap the worst case.

## Technical notes

- `supabase/functions/ai-trading-engine/index.ts`: in the sizing paths (~lines 2902 and 4652–4726), drop the `* confidence` multiplier and stop honoring a model-suggested `size_percent` lower than the cap; apply a new per-trade floor constant. Keep `SCALP_MAX_POSITION_PCT` (15) notional cap, `SCALP_MAX_CONCURRENT` (12), and the `max_capital_usage` (85%) check as the binding limits.
- `supabase/functions/risk-manager/index.ts`: no threshold changes; it stays the gatekeeper and will still reject anything over the per-position or capital-usage caps.
- `src/components/risk/RiskSettingsPanel.tsx`: display-only update so the panel shows the per-trade floor alongside the existing locked caps.
- Redeploy `ai-trading-engine`; verify on the next cycles that new positions land near 12.75% of base and total deployed climbs toward 85% without capital-usage rejections in the logs.

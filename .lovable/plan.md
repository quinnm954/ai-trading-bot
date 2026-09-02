# Capital Planner + Win-Rate Repair

Two tracks: make expectancy positive first, then give you a card that tells you exactly how much capital a daily profit goal needs.

## Track 1 — Get the win rate above breakeven

With the current net exit geometry (win +2.56%, loss −1.60% after the 0.8% fee round trip), breakeven is a **38.5% win rate**. Closed trades in the database currently show **31.6%** wins, so scaling the deposit would only scale losses. Work, in order:

1. **Diagnose, don't guess.** Build a one-off analysis of every closed trade: exit reason (target / stop / trailing / force-close / rotation), realized % vs the intended +2.56% / −1.60% pair, hold time, and entry momentum readings. The goal is to learn whether losses come from (a) genuinely wrong entries, (b) winners exiting early below target, or (c) force-close/rotation cutting trades before geometry resolves. No entry-filter changes ship until this report names the cause.
2. **Fix the cause the report names.** Likely candidates, to be confirmed by step 1:
   - Tighten entry gates (`entry_min_5m_pct`, `entry_min_15m_pct`, `entry_min_1h_pct`, `entry_min_24h_pct`) and require regime = trending for new scalps.
   - Ensure no exit path can realize less than the solved target on a winner (trailing stop and rotation must not close a live winner below the net TP).
   - Stop force-close from converting unresolved trades into small losses that drag the win rate.
3. **Add an expectancy guard.** If the trailing 30-trade win rate sits below breakeven, the engine reduces size (or stands down) instead of continuing to trade a negative-expectancy setup, and the reason surfaces in the Agent Console.

## Track 2 — Capital Planner card

A new dashboard card, "Capital Planner":

- Input: target daily profit (default $200).
- Reads your live numbers: realized win rate (trailing window), average net win / net loss %, current slot count, average trades per day, average notional as % of equity, and the 80% capital-usage cap.
- Outputs: required deposit, expectancy per trade, projected daily/monthly profit at the current deposit, and days-to-milestone.
- Shows a clear warning when the measured win rate is below the 38.5% breakeven, stating that no deposit size reaches the goal until expectancy turns positive.
- Lets you override win rate and trades/day to run "if everything works as it should" scenarios.

Reference math the card implements:

```text
net expectancy % = w × 2.56 − (1 − w) × 1.60
daily $ = deposit × (avg notional % of equity) × expectancy% × trades per day
required deposit = target daily $ ÷ (notional% × expectancy% × trades/day)
```

At 12 slots / 80% cap (~6.7% notional per slot) and ~40 trades/day, that lands at roughly $27.5k at a 45% win rate, $15.6k at 50%, $10.9k at 55%.

## Technical notes

- Exit geometry stays sourced from `supabase/functions/_shared/exit-geometry.ts` — no new ratio constants anywhere.
- Entry-gate and expectancy-guard changes live in `supabase/functions/ai-trading-engine/index.ts` and are mirrored by the risk-manager gate so paper and live behave identically.
- The planner card is presentation-only: a new `src/components/dashboard/CapitalPlannerCard.tsx` plus a hook that aggregates closed-trade stats; it does not change sizing behavior.
- Risk Settings remains the single source of truth for slots, caps, and stop size; the planner reads those values rather than hardcoding them.

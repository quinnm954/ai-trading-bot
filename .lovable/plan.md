# Most buys never reach the 4% target — what the data shows and what to change

## What I checked

Closed trades over the last 30 days: **11 exits — 1 take-profit, 1 trailing stop, 7 stop losses, 2 manual force-closes.**

Two concrete problems fall out of that:

1. **The trailing stop is dead code.** Wide mode arms trailing at +4.0% gross, which is exactly the take-profit level. A trade that runs to +4% simply take-profits, so trailing can never bank an intermediate move. Every open position right now is sitting between −1.0% and +3.4% with nothing protecting the gain, and the only two decent results today (+4.04% UNI, +2.52% VVV) were closed **by hand**, not by the engine.

2. **Stops are firing deeper than 1.2%.** Recorded stop exits: −1.20%, −1.20%, −1.40%, −1.46%, −1.63%, −1.67%, −2.38%. The contract is 1.2%. So losers are up to 2x their designed size while winners are capped at 4% — the payoff is worse than the geometry claims.

So it's not that the 4% target is broken; it's that the engine has no way to bank the +2–3% moves it actually produces, and it lets losses run past their level.

## Changes

**A. Give the engine a way to keep partial gains**
- Arm the wide-mode trailing stop well below the target (around +1.8–2.2% gross) with a tighter giveback, so a move that stalls at +3% books a real net win instead of round-tripping to the stop.
- Keep the 4% target as the full exit; trailing only takes over once the trade is comfortably in profit and the net win still clears fees.

**B. Take partial profit at an interim level**
- Sell a portion (about half) at roughly +2% gross and let the rest run to +4% with the trailing stop active behind it. This converts the frequent +2–3% excursions into realized profit while keeping upside on the runners.

**C. Stop the stop-loss overshoot**
- Re-check price immediately before submitting the exit and record intended level vs actual fill on every stop exit, so slippage becomes a measured number instead of an inference.
- Cap what counts as an acceptable stop fill and log an incident when a fill lands materially past the level, so repeat offenders (thin books) can be excluded.

**D. Apply to existing positions**
- The new trailing/partial levels get applied to already-open wide positions, the same way the 4% change was, so current holdings benefit immediately rather than only new entries.

## Not doing

No change to the 4% target, the 1.2% stop, the tape gate, or the entry filters. This is purely about exiting the moves we already capture. No profit is guaranteed by any of it.

## Technical notes

- `supabase/functions/_shared/exit-geometry.ts` + `src/lib/exitGeometry.ts`: lower `WIDE_TRAIL_ARM_PCT`, tune `WIDE_TRAIL_DROP_PCT`, add partial-TP constants (mirrored client-side).
- `supabase/functions/auto-take-profit/index.ts`: partial-exit branch, trailing arm using the new constant, pre-exit price refresh, intended-vs-actual stop logging, incident row on excess slippage.
- One-time update of open wide positions to the new trailing/partial contract; redeploy `auto-take-profit`.

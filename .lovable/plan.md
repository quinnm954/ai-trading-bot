# Why we're losing bigger and more often — and the fix

## First: the tuning does run without you logged in

The tuner ran for all four accounts within the last few minutes, on the server's own 
schedule, with nobody signed in. Recent tuning runs today: 06:59, 07:00, 10:17, 10:20, 
10:24, 10:58, 12:03, 12:12, 12:13, 12:26, 14:00, 14:01, 14:26, 14:27, 14:28. It is not 
tied to your browser. So that isn't the problem — but what the tuner is *doing* is.

## What today's numbers actually show

Closed trades today, all accounts:

| Outcome | Count | Average result | Total |
|---|---|---|---|
| Stopped out | 24 | −1.87% | −$4,203 |
| Trailing-stop win | 6 | +1.38% | +$280 |
| Time-limit exit | 4 | −0.88% | −$462 |

Two hard facts fall out of that:

1. **Losers are bigger than winners by design right now.** The stop sits at 1.89% but 
   the profit-lock hands back the trade at about +1.2–1.8%. The 5.17% target was hit 
   zero times. So we risk ~1.9% to collect ~1.4%. Even a coin-flip win rate loses money, 
   and we're at 20%.

2. **The tuner is thrashing.** It re-tunes after every single closed loss, 10–13 
   parameters at a time, and it has now pinned the entry filters at their strictest 
   limits (score 86–90, volume 1.3, chase 1.0%, RSI 58–60). Tightening didn't raise the 
   win rate; it just fires again on the next loss. It is chasing noise, not learning.

## The fix

**1. Stop giving back the winners**
- Arm the profit lock much later — only once a trade is well past the risk it took 
  (roughly 2.5× the stop distance) — and give it more room to breathe instead of 
  snatching it at +1.4%.
- Below that level a trade either reaches its target or hits its stop. No more 
  "small win, full-size loss" pattern.

**2. Make the loss smaller than the win**
- Tighten the stop cap so the worst case is clearly smaller than what a normal win 
  pays, and recompute the target from the actual stop so reward always beats risk 
  after fees.

**3. Stop the tuner from thrashing**
- Require a real batch of new evidence (several newly closed trades, plus a cooldown) 
  before it changes anything, instead of reacting to every single loss.
- When results are bleeding, it stops cranking filters to their extremes; that lever 
  is proven not to work here.

**4. Add a bleeding circuit breaker**
- If the last 10 closed trades come in under a 25% win rate, new entries pause for a 
  few hours and you get a notification saying exactly why, instead of the system 
  grinding down the balance while it "tunes".

## Not doing

Not touching the market/tape gates, position sizing, concurrency caps, the copy-trading 
path, or wide-stop mode (already off everywhere). No profit is guaranteed by any of this.

## Technical notes

- `supabase/functions/_shared/exit-geometry.ts` + `src/lib/exitGeometry.ts`: lower the 
  tuned stop ceiling, raise the trailing arm threshold to a multiple of stop distance, 
  widen the giveback, keep the fee-net reward:risk solve.
- `supabase/functions/auto-take-profit/index.ts`: use the new arm/giveback contract.
- `supabase/functions/ai-trading-engine/index.ts`: tuner gating (min new closures + 
  cooldown), remove extreme-tightening branch when bleeding, add the 10-trade 
  circuit breaker with a `risk_events` notification.
- Redeploy engine, exit and risk functions; verify against live account data afterwards.

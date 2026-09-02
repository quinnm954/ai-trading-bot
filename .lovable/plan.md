# Why the profits are tiny — and how to fix it

## What the data actually shows

Two separate things are happening, and only one of them is a bug.

### 1. Your real money account holds $3.60

Your connected Coinbase account balance is **$0.0007**, and the recorded starting investment is **$3.60**. Every live trade the bot has placed averaged a **$12.90** position. Across **73 closed live trades** the bot netted **+$1.75** — which is actually a *+49% return on a $3.60 stake*.

Nobody makes hundreds on one trade with $3.60 of capital. The person making more on one trade is trading thousands of dollars per position. Percentages have been fine; the capital base is the constraint.

Your paper account (separate, $100k simulated) has 15 closed trades netting **+$55.33** on ~$3,400 positions.

### 2. Real bug: stop losses are firing at roughly double their setting

Your stop is configured at **-0.8%**. Actual closed stop-loss exits averaged **-1.597%** — about 2x too deep. Meanwhile winning exits averaged only **+0.564%**, far below the 1.4% take-profit target, because most wins close early on trailing/rotation rather than reaching full target.

Net effect: designed risk/reward of 1.75:1 is being realized as roughly **0.35:1**. Wins are small, losses are double-size. That is why totals crawl even when the win rate looks fine (10 wins / 5 losses in paper).

### 3. Secondary bug: a deleted broker is still inflating your live equity

There is a leftover `alpaca` live-account row showing **$100,000 equity**, last synced **May 28**. Live balance is computed by summing all live accounts, so live-mode equity displays are being polluted by a broker you removed.

## Plan

**A. Fix the stop-loss depth (the real profit leak)**
- Investigate why exits land at -1.6% when the trigger is -0.8%: the exit manager only checks once per minute, so a fast move can gap well past the level before the check runs.
- Add an intra-cycle price re-check and tighten the exit path so a stop that is already breached exits at the first observed price instead of waiting for the next full cycle.
- Log the intended stop level next to the actual fill on every stop exit so slippage becomes measurable rather than inferred.

**B. Make wins reach their target**
- Raise the trailing-stop activation threshold so trades are given room to reach the 1.4% take-profit instead of being trailed out around +0.5%.
- Keep the 0.8% fee accounting and the minimum net-exit rule intact.

**C. Clean up stale broker equity**
- Remove the orphaned Alpaca live-account row and ensure disconnecting a broker deletes its account row rather than leaving it at a stale balance.

**D. Surface the capital reality in the UI**
- Show actual connected-broker balance and starting capital on the dashboard, so live results read as "+49% on $3.60" rather than an ambiguous "+$1.75".

## Not in scope

Adding real capital is your decision, not a code change. Once stops behave and wins reach target, the same percentages applied to a larger balance are what produce meaningful dollar amounts — the engine cannot manufacture size out of $3.60.

## Technical notes

- Stop depth: `supabase/functions/auto-take-profit/index.ts` — stop evaluation and fill path; add pre-exit price refresh and record intended-vs-actual.
- Trailing exits: same file, trailing-stop activation and `MIN_NET_EXIT_PCT` interaction.
- Stale broker rows: `src/hooks/useApiConnections.ts` disconnect path zeroes balances but leaves rows; plus a one-time cleanup of the orphaned `alpaca` row.
- Capital display: `src/components/dashboard/` — surface `live_account.balance` and `ai_settings.live_initial_investment`.

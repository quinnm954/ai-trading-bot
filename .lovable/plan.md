# Fix Milestone Progress velocity

## What's wrong

The Velocity figure divides the profit of the last 50 closed trades by the time
between the **first and last close in that batch** — not by real elapsed time.

Your paper account right now: 6 closed trades, all closed within the same
0.76 seconds (a batch close-all at 15:51:54), total realized profit $0.32. The
card therefore computes $0.32 / 0.00021 hours ≈ **$1,500/hr**, even though those
trades actually took ~19 minutes to play out and the account has only gained
$0.18 overall. The "Est. Time" box inherits the same inflated number, so it
reports a milestone ETA that is off by orders of magnitude.

Two smaller issues from the same block:
- With exactly one closed trade, velocity silently shows $0.00/hr ("Need
  profitable trades") instead of a real rate.
- Only realized P&L counts, so a card with open winners can show $0.00/hr.

## The fix

Measure velocity over a fixed wall-clock window instead of the gap between
trade closes:

1. Sum realized P&L of trades closed in the **last 24 hours** and divide by the
   hours actually elapsed in that window (measured to now, not to the last
   close).
2. If there is no activity in the last 24 hours, fall back to a 7-day window,
   then to "since trading started"; if there is still nothing, show `--` rather
   than a fabricated rate.
3. Never let the elapsed divisor fall below a sane floor (1 hour), which is what
   makes a batch of simultaneous closes explode today.
4. Relabel the box "Velocity (24h)" so the number's meaning is explicit, and add
   a tooltip noting it's realized profit per hour over the window used.
5. Est. Time uses the same corrected rate, and shows "Not enough data" when the
   rate is unavailable rather than "Calculating..." forever.

Everything else on the card (equity, progress bar, remaining, total P&L, cash
and positions breakdown) stays as is.

## Technical notes

Single file: `src/components/dashboard/MilestoneProgressCard.tsx`.

- Replace the `recentTrades`-span calculation (currently lines ~104-117) with a
  windowed query: `closed_at >= now - 24h`, keeping the existing
  `user_id` / `is_paper` / `status = 'closed'` filters.
- Store `recentProfitRate` plus a `velocityWindow` label (`'24h' | '7d' |
  'since start' | null`) in state so the UI can render the right caption.
- Elapsed hours = `(now - windowStart) / 3600000`, clamped with
  `Math.max(1, ...)`; for the "since start" case use `paper_account.created_at`
  (or `live_account.created_at` in live mode), which is already fetched.
- No database or backend changes; no schema migration.

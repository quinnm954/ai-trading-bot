# Why it went quiet overnight — and the fix

## What actually happened

Checked the data for the last 30 hours:

- The trading engine cron ran fine: 60 successful runs per hour, every hour, all night.
- Entries stopped at 03:36 UTC (11:36pm New York) and did not resume until 12:41 UTC (8:41am) — right when you opened the app again.
- Five positions opened at 02:19 UTC (ZEC, LINK, TRUMP, SOL, ETH) stayed open for 9+ hours and were all closed at once at 11:43 UTC, each at the full -0.8% stop (-$127.74 x 5 = -$638.72).
- Net result today: about -$800 realized on 19 closed trades, with 4 positions open now.

Root cause: the **exit manager (take-profit / trailing / stop-loss) has no server-side schedule**. Only the trading engine is on cron (`ai-trading-engine-every-minute`); `auto-take-profit` runs only while the app is open in a browser tab, on a 5-second interval.

Consequences, in order:

1. Tab closed at night → no exits were evaluated at all, so winners were never banked and losers kept sliding.
2. Those 5 unexited positions filled every trade slot (engine hard cap is 5 concurrent), so `remaining slots = 0` and the engine skipped new entries for 9 hours.
3. When the tab came back, the exit manager ran once and dumped all 5 at their stops simultaneously.

So it wasn't a strategy failure — the bot was half-asleep: buying was automated, selling was not.

## The fix

1. **Schedule the exit manager server-side.** Add a `pg_cron` job that invokes `auto-take-profit` every minute for all users with open positions. The function already supports this exact mode (no-auth call fans out over all users with AI enabled or open positions), so no new logic is needed — only the schedule.
2. **Keep the browser loop as a bonus, not the source of truth.** Leave the in-app 5-second interval for snappy UI, but the cron becomes the guarantee.
3. **Free up slot pressure.** The engine's hard cap of 5 concurrent scalps is what turned 5 stuck positions into a full stop. Raise the hard cap to match your configured limit (12) so one stuck cohort can't freeze all trading, while the per-cycle entry cap of 2 stays as-is.
4. **Add a stale-position guard.** If a position has been open longer than a max hold window (proposed: 90 minutes) without hitting TP or stop, close it at market and tag the exit `max_hold`. This prevents overnight drift from turning small trades into full-stop losses.
5. **Surface it on the dashboard.** Show "last exit check" time next to the bot status so a silent exit manager is visible immediately instead of nine hours later.

## Expected effect

Overnight cycles will manage exits every minute: winners get banked at TP/trailing, losers get cut at -0.8% within a minute instead of hours later, and slots recycle so the engine keeps taking new setups while you sleep.

## Technical notes

- New cron job: `auto-take-profit-every-minute`, `* * * * *`, `net.http_post` to the `auto-take-profit` function with the anon key (matching the existing engine job's pattern so the fan-out branch is taken).
- `SCALP_MAX_CONCURRENT` in `supabase/functions/ai-trading-engine/index.ts` changes from 5 to 12; the strict min against `ai_settings.max_concurrent_trades` (20) and `scalp_settings.max_concurrent_positions` (12) still applies.
- Max-hold exit added to `supabase/functions/auto-take-profit/index.ts` alongside the existing hard-stop precedence, using the same atomic `adjust_paper_balance` credit path and `MIN_NET_EXIT_PCT` fee accounting for the profitable case.
- Both functions redeployed after the changes.

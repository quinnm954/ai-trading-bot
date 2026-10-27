# Every account mirrors your account

## What you'll get
- Only your account (quinnm954) runs Kronos and makes decisions.
- When your account buys, every other account buys the same coin within seconds, scaled to its own balance. For example, if you put 2.5% of your balance into a coin, they each put 2.5% of theirs.
- When your account sells (target hit, stop hit, time limit or Kronos's call), every follower sells the same position.
- Followers no longer make their own AI calls, which saves roughly 5/6 of the AI credits.
- Followers inherit your Conservative settings, rules and lessons automatically, since the decisions are yours.
- The 30% emergency floor and kill switch still apply on every account separately. A follower that hits its floor stops copying.
- Bots stay off until you say go.

## Steps
1. Add a per-account setting "Mirror leader account", on for the five other accounts and pointed at yours.
2. Followers skip their own Kronos and engine cycle while mirroring.
3. After every buy your account completes, create the same buy for each follower at the same percentage of their balance, through the normal buy path, so paper and live behave the same. Skip a follower if it has too little cash (under $5), has hit its floor, or already holds that coin.
4. After your account closes a position, flag the matching follower positions to close immediately through the normal exit path.
5. Followers see nothing about mirroring: their dashboard, trade history and Agent Console show the trades as their own agents' normal activity, with your account's reasoning copied across. Your email and account are never shown to them.
6. Test it on practice money: trigger one buy and one sell on your account, then confirm all five followers opened and closed the same coin at the right size.

## Live-money note
With real money, all accounts buying a small coin together can push the price up. Each follower checks the price before buying and skips the trade if it has moved more than 0.5% from your fill.

## Technical notes
- New nullable `ai_settings.mirror_leader_user_id` (uuid), added in an additive migration.
- `agent-orchestrator` skips the Commander for accounts with a leader set.
- `ai-trading-engine` `execute_approved_trade`: on a successful leader buy, fan out `pending_trades` (status approved, strategy "custom", reasoning "Mirror of leader") for each follower, sized as `leader_usd / leader_equity × follower_equity`, then call `execute_approved_trade` for each.
- Exit engine: when a leader position closes, set `max_hold_minutes = 1` on follower positions with the same symbol, `is_paper` and mirror flag. A new `positions.mirror_of` column ties them together.
- The hard floor and kill switch are checked per follower before the fan-out.
- The decision gets recorded as a rule in `AGENTS.md`: one leader, followers mirror through the shared execution path.

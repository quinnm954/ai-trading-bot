# Make "Reset Balance" actually reset everything

## What's happening

The reset button already tries to clear trades, P&L history, expectancy inputs and agent logs, but most of those deletions are silently rejected by the database's security rules. Confirmed in the database: delete is explicitly denied for `trades`, `equity_history`, `daily_pnl`, `risk_events`, `ai_decisions`, `strategy_performance`, and there is no delete rule at all for `futures_positions`, `signal_scores`, `backtest_runs`, `liquidation_estimates`, `margin_logs`, `copy_trade_signals`, `agent_messages`, `agent_incidents`. Only positions, pending trades, cooldowns, grid layouts and journal notes actually get removed.

Because closed trades survive, expectancy per strategy, today's trades count and today's P&L all keep showing the old numbers after a reset.

Separately, "Set Custom Paper Balance" in Settings only changes the balance — it clears nothing, so the same stale stats appear there too.

## The fix

1. Move the reset into one server-side database routine that runs with elevated privileges and wipes everything for the signed-in user in a single transaction:
   - paper trades, paper positions, paper futures positions
   - equity history (then insert one fresh point at the new balance), daily P&L, risk events
   - AI decisions, signal scores, strategy performance, backtests, liquidation estimates, margin logs, copy-trade signals, agent messages and incidents, symbol cooldowns, pending trades, journal notes, grid layouts
   - risk trackers (drawdown, peak equity, daily/weekly loss, kill switch) and agent counters
   - sets balance and initial balance to the chosen amount
2. Make the amount a parameter, so "reset to $100,000" and "set custom balance" both go through the same full wipe. Setting a custom balance will therefore also start a clean slate — which is what testing needs.
3. Have the app call that routine instead of the current pile of client-side deletes, then refresh the dashboard so equity chart, expectancy, today's trades and today's P&L immediately read zero.
4. Verify after implementing: run the reset, then confirm zero closed trades, zero open positions, a single equity point, and empty expectancy rows for the account.

## Technical notes

- New `SECURITY DEFINER` function `public.reset_paper_account(p_balance numeric default 100000)` scoped to `auth.uid()`, granted to `authenticated`. This avoids loosening any table's delete policies (the tables stay delete-denied for direct client access).
- `src/lib/resetPaperAccount.ts` becomes a thin wrapper calling that function via RPC.
- `ResetPaperBalance.tsx` custom-balance save switches to the same RPC (with a clear confirmation that data is cleared).
- `ExpectancyCard` reads the `strategy_expectancy` view, which is derived from `trades`, so it clears automatically once trades are gone.

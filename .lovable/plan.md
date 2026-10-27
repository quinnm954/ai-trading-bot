# Bring back "making money" behaviour

## What the records actually show

The saved trade history (paper accounts) does not show a profitable period in mid-September:

| Week starting | Closed trades | Net result | Win rate |
|---|---|---|---|
| Sep 14 | 115 | -$2,959 | 36.5% |
| Sep 21 | 325 | -$12,299 | 22.2% |
| Sep 28 | 416 | -$17,835 | 21.9% |
| Oct 5 | 197 | -$15,832 | 15.2% |
| Oct 12 | 3 | -$47 | 33.3% |

From Sep 8 to 29, every trade used the short "scalp" style (about 5-hour holds): 467 trades, -$16,086 net, 26% wins. No trades are recorded before Sep 14, so there is no winning version from back then to copy. The best result on record is Kronos's recent run: one account +$45, another -$64.

## Plan

1. **Don't copy September.** Rebuilding that behaviour would bring back the losses.
2. **Find what actually wins in your own history.** Break all closed trades down by coin, time of day, hold length, setup score and exit reason, and keep only the groups that made money after fees.
3. **Test before turning anything on.** Run those rules against the 90 days of saved market data, with fees included. Only adopt them if they beat Kronos's current results across enough trades.
4. **Give Kronos the winners as fixed rules.** He follows them, and new buys stop matching the losing patterns. The 30% emergency floor and the kill switch stay as they are.
5. **Bots stay off.** I'll show you the test results, and nothing starts until you say so.

## Technical notes
- The analysis is read-only and uses the `trades` table (pnl, strategy, playbook_score/grade, setup_key, exit_reason, hold times).
- The existing crypto backtest replay runs the variants. Rules that pass are written into `commander_memory` and enforced by `checkRules`.
- No code or database rollback.

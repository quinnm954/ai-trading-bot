# Make the bot trade with positive expectancy

## What the data actually shows

I pulled your live trade ledger and exit configuration. The bot is not losing because it picks bad coins — it wins most of the time. It loses because each win is capped far below each loss.

Paper account, closed trades:

| Metric | Value |
|---|---|
| Closed trades | 22 |
| Win rate | 68% (15W / 7L) |
| Average win | +$38.56 |
| Average loss | -$89.11 |
| Net | **-$45.46** |

Your exit settings explain it exactly:

- Take profit: **0.6%**
- Hard stop loss: **1.5%**
- Trailing stop drop: **0.61%**

Expected value per trade = (0.68 x 0.6%) - (0.32 x 1.5%) = **-0.07% per trade**. The configuration is mathematically unprofitable no matter how good the entries are. Losses are 2.5x wins by design, and the trailing drop (0.61%) is roughly equal to the take profit, so winners get cut before they can run.

Live account is +$6.24 over 79 trades, but on tiny position sizes — statistically flat, not evidence the logic works.

Two more issues found:

- **Paper models no trading fees.** Live pays ~0.8% round trip on maker fills. A paper strategy netting under ~0.8% per trade is a guaranteed loser live.
- **Conflicting concurrency caps**: `scalp_settings.max_concurrent_positions = 1` vs `ai_settings.max_concurrent_trades = 20`.

Honest framing: I can make the math sound and prove it out on your history. I cannot promise a profitable future — anyone who does is lying. What I *can* guarantee is removing the structural reason it currently can't win.

## The fix

### 1. Rebuild exit geometry around a minimum reward:risk

Enforce, in code, that take profit is never below a floor relative to the stop:

- Minimum **1.6:1** reward:risk on every scalp
- Take profit floor of **1.4%** gross (clears the 0.8% fee round trip with real edge left)
- Hard stop tightened to **0.8%**, so a loser costs less than a winner earns
- Trailing stop only arms **after** the position is past breakeven-plus-fees, and trails at 40% of the current gain rather than a fixed 0.61% — winners keep running

Add a hard guard in the engine: if a configured TP/SL pair yields expectancy <= 0 at the strategy's trailing win rate, the engine **refuses the trade** and logs why, rather than taking a mathematically losing setup.

### 2. Charge fees in paper mode

Paper fills get the same 0.4% maker fee per side as live. Paper stops being an optimistic simulator and becomes a valid predictor of live results. This will make paper P&L look worse initially — that is the point.

### 3. Expectancy gate before trading resumes

Add a per-strategy expectancy tracker (win rate, avg win, avg loss, net expectancy per trade, all fee-inclusive). A strategy may only take trades while its trailing 20-trade expectancy is positive. Negative expectancy strategies are benched automatically and the capital allocator routes to the ones that are working.

### 4. Reconcile the conflicting caps

Single source of truth on the Risk page. Concurrency, position size, and capital usage resolve to one value used by every engine; the tighter of the two caps wins instead of them disagreeing.

### 5. Validate before going live again

Your bot is currently stopped (`enabled = false`) from the earlier full stop. Before restarting:

- Replay existing trade history through the new exit geometry using the backtesting runner and report the delta
- Restart in paper only, with fees on
- Report an expectancy dashboard row: expectancy per trade, trades/day, and projected days-to-double based on measured numbers — not assumptions

I will not flip live trading back on as part of this. You do that once paper shows positive fee-inclusive expectancy over a real sample.

### 6. What I am also going to recommend against

`risk_tolerance` is currently `ultra_aggressive` with `max_position_size = 40%` of equity and 20 concurrent trades. With a broken expectancy that setting was accelerating the losses. Once expectancy is positive, aggression compounds gains — but 40% per position means roughly three bad trades can take a third of the account. I will leave it as you set it, but the expectancy gate will now stop it from scaling a losing strategy.

## Technical changes

- `supabase/functions/auto-take-profit/index.ts` — TP/SL floor enforcement, min R:R constant, gain-proportional trailing that arms past breakeven+fees, paper fee accounting on exits
- `supabase/functions/ai-trading-engine/index.ts` — pre-trade expectancy guard, paper entry fee accounting, cap reconciliation (tighter of `ai_settings` / `scalp_settings`)
- New migration — `strategy_expectancy` view/table for trailing per-strategy fee-inclusive expectancy, with GRANTs and RLS scoped to `auth.uid()`
- `supabase/functions/risk-manager/index.ts` — reject trades whose configured exit geometry has non-positive expectancy
- `src/components/risk/RiskSettingsPanel.tsx` — TP slider cannot be set below the R:R floor against the chosen stop; shows live computed expectancy as you drag
- `src/pages/Dashboard.tsx` + new expectancy card — expectancy per trade, trades/day, projected days-to-double from measured data
- `supabase/functions/backtest-runner/index.ts` — replay closed trades under new geometry for the before/after report

## What stays off

Bot stays disabled at the end of this work. I will hand you the backtest delta and you press Start when you are satisfied.

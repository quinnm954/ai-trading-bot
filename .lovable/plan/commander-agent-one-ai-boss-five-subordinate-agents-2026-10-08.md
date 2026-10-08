# Commander Agent: one AI boss, five subordinate agents

## Goal
Replace the current equal-peer agent loop with one **Commander** that thinks with AI every cycle, sees everything, gives orders, and is judged on one score: maximum profit in the shortest time with minimum loss. The existing agents become subordinates that report up and carry out orders.

## Decisions (from your answers)
- Commander reasons with AI on every cycle.
- Commander has **full control of risk limits**: it sets position size, stop loss, daily loss, drawdown, slots and leverage itself.
- Applies to **paper and live accounts at the same time**.
- All bots **stay stopped** until you press Start on the new Commander.

## Chain of command

```text
                 COMMANDER (AI, every cycle)
   reads reports -> decides -> issues orders -> grades results
     |        |         |          |           |
  Watcher  Analyst    Risk       Trader      Healer
  (market) (signals) (checks,   (places     (fixes
                      reports)   orders)     errors)
```

- **Watcher**: prices, market tape, volatility, news. Reports only.
- **Analyst**: scores coins and stocks, runs quick backtests on request.
- **Risk**: calculates exposure, loss so far, liquidation distance. It advises and no longer blocks; the Commander has the final say.
- **Trader**: places only the buys and sells the Commander orders, on Coinbase (crypto) or Alpaca (stocks), or as paper fills.
- **Healer**: fixes broken feeds and failed orders, and tells the Commander.

## What the Commander can do (its toolbox)
- Read: portfolio, positions, trades, P&L, market data, signals, Fusion scores, copy-trading feed, news, backtest history, past decisions and their results.
- Order subordinates: scan, analyse, backtest, buy, sell, close everything, pause an agent.
- Set every risk and engine setting for the account, including switching between crypto and stocks.
- Write a short reason for every decision, shown in the Agent Console.
- Learn from results: each cycle it sees how its last orders turned out and its running score (profit per hour, worst loss).

## One hard backstop (proposed, not a risk setting)
Even with full control, I recommend one emergency brake the Commander cannot change: if an account falls **30% below its starting balance**, everything stops until you restart it. You can veto this.

## What you'll see
- A new Commander panel at the top of the Agent Console: its current plan, latest orders, which agent is doing what, and its score.
- The Start/Stop bot button now starts and stops the Commander, so a manual Stop still sticks.
- Every order and reason appears in the notifications and decision log.

## Costs and risk you should know
- AI runs on every cycle for every running account (each 30 minutes means 48 calls a day per account). This uses AI credits.
- Full control on live accounts means the Commander can take large losses with real money. No profit is guaranteed.

## Build steps
1. Database: a new table for Commander orders (agent, task, status, result) and a table for the Commander's score per cycle; add settings for "who controls risk" and the 30% backstop.
2. A shared Commander "brain" that collects every report into one briefing and calls the AI with a fixed set of tools (one tool per order type).
3. Change the orchestrator so each cycle runs: subordinates report, then Commander decides, then subordinates carry out orders, then results are recorded.
4. Change the trading engine and risk manager so they follow Commander orders and limits instead of the fixed locked values, for both paper and live.
5. Agent Console Commander panel, plus the Start/Stop button wired to the Commander.
6. Test on one paper account through several cycles, check every order and fill in the history, then report back. Bots stay stopped afterwards.
7. Update project memory: the "risk settings locked" rule becomes "Commander controls risk".

## Technical details
- New edge-side module `_shared/commander.ts`: builds the briefing from paper_account/live_account, positions, trades, ai_settings, agent_state, agent_messages, signal_scores, Fusion output, tape gate, copy_trade_signals, backtest_runs and the recent commander_orders with outcomes.
- AI: Lovable AI Gateway, `openai/gpt-6-astra` on `/v1/responses`, streamed, `store:false`, reasoning effort `medium`, function tools: `order_scan`, `order_analyse`, `order_backtest`, `order_buy`, `order_sell`, `order_close_all`, `set_risk_params`, `set_market_mode`, `pause_agent`, `note`. Tool loop up to 50 steps per cycle.
- Gateway errors: 402/403 pause the Commander for every account (stored flag checked by the cron), 429/5xx back off until the next cycle.
- Tables: `commander_orders` (user_id, cycle_id, agent, action, payload jsonb, status, result jsonb, reason, created_at) and `commander_scores` (user_id, cycle_id, equity, pnl_since_start, pnl_per_hour, max_drawdown). RLS: owner read, service-role write.
- `ai_settings`: add `commander_enabled`, `risk_controlled_by` ('commander'|'locked'), `hard_floor_pct` default 30.
- `agent-orchestrator/index.ts` restructured into report → command → execute → grade. The risk-manager returns advisories when `risk_controlled_by='commander'`; hard floor check runs before any buy.
- Copy-only mode, the manual-stop rule and the paper/live fill paths keep working as they do now.

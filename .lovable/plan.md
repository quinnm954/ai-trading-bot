# Get Kronos trading again

## What's actually going on
- The "fight" with the Healer is mostly a misreading. Hermes (Trader) still has an old status note from Oct 2 saying "reset by healer (stuck)". Kronos reads that note every cycle, treats it as a new reset, and pauses Hermes again "to be safe".
- Kronos's instructions tell him to prefer few, high-conviction trades and never require a scan. With Athena reporting no setups, the safest answer is always "stay in cash".

## Changes
1. **Stop the Healer/Kronos loop**
   - Clear Hermes's stale "reset by healer" note.
   - The Healer skips any agent Kronos paused on purpose, and never resets an agent that is paused.
   - Kronos's briefing marks Healer resets with a time, so he only reacts to resets from the last hour.
2. **Make Kronos scan regularly**
   - If Kronos hasn't run a trading scan in the last 2 cycles (about 1 hour) and the account isn't at its emergency floor, the system runs one for him automatically.
   - Pausing Hermes now expires after 2 cycles unless Kronos renews it with a new reason.
3. **Lower his bar for buying (more trades, more risk)**
   - New instructions: in sideways markets, take small trades (about half his normal size) on the best 1–2 coins that are clearly rising, instead of waiting for a perfect setup.
   - Trades must still clear fees (about 0.8% round trip), and every buy needs a stop-loss.
   - The 30% emergency floor and copy-trading rules stay exactly the same.

## How I'll check it
Run one Kronos cycle on your practice account and confirm:
- Hermes is not paused.
- A scan ran.
- Kronos either bought something or gave a specific reason for not buying.

## Technical details
- Clear the stale note with a data update: `agent_state` where agent='trader', current_task 'reset by healer (stuck)'.
- `agent-orchestrator/index.ts`: in `reset_stuck_agents` / stuck detection, exclude agents with an active `agent_overrides` pause and status 'paused'.
- `_shared/commander.ts`:
  - SYSTEM prompt: add a ranging-market playbook (half size, top 1–2 risers, stop required, beat 0.8% fees), and say a scan should run at least every 2 cycles.
  - After the tool loop: if no `order_engine_cycle` appears in the last 2 cycles of `commander_orders`, call the engine with `commander_call` and record it as an automatic scan.
  - `pause_agent` for trader: store `expires_cycles: 2` in the payload. The orchestrator ignores trader pauses older than about 65 minutes unless they are renewed.
- Deploy agent-orchestrator, then run one test cycle.

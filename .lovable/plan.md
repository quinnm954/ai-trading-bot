## Tiered agent cadence

Replace the current single "run all 5 agents every 30 min" cron with three cron jobs, each invoking the orchestrator with a filter for which agents to run.

### Schedule

| Tier | Agents | Frequency |
|---|---|---|
| Fast | Watcher, Risk, Trader | every 5 min |
| Medium | Analyst | every 15 min |
| Slow | Healer | every 30 min |

### Changes

**1. `supabase/functions/agent-orchestrator/index.ts`**
- Accept an optional `agents: AgentName[]` field in the request body.
- If provided, `runOneCycle` runs only those agents (in canonical order: watcher → analyst → risk → trader → healer). Otherwise runs all 5 (preserves current behavior + manual triggers).

**2. Cron jobs (via `supabase--insert`, not migration, since URL+anon key are environment-specific)**
- Unschedule existing `agent-orchestrator-every-30-min`.
- Schedule three new jobs:
  - `agent-orchestrator-fast` — `*/5 * * * *` → body `{ "agents": ["watcher","risk","trader"] }`
  - `agent-orchestrator-medium` — `*/15 * * * *` → body `{ "agents": ["analyst"] }`
  - `agent-orchestrator-slow` — `*/30 * * * *` → body `{ "agents": ["healer"] }`

### Notes
- Healer's auto-reconciliation and code/schema audits remain on the 30-min cadence (matches what was just built).
- Risk's kill-switch is now checked every 5 min instead of every 30 — much tighter capital protection.
- Manual orchestrator invocations from the UI still run the full cycle (no `agents` filter sent).
- No DB schema changes; no UI changes.

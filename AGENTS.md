# Architecture rules

- The Commander (`supabase/functions/_shared/commander.ts`, run from `agent-orchestrator`) is the only decision-maker when `ai_settings.commander_enabled`; the systematic `ai-trading-engine` cycle runs only on a Commander `commander_call`, so trading has a single chain of command.
- Commander buys go through the engine's `execute_approved_trade` path and sells flag positions for the exit engine, so paper and live fills share one code path.
- The hard floor (`ai_settings.hard_floor_pct`) is enforced in code and is not exposed as a Commander tool, so the AI can never remove the last emergency brake.
- Commander-hired specialists live in `commander_specialists` and are run in `_shared/commander.ts` before the Commander's decision; the team cap (`MAX_SPECIALISTS`) is enforced in code so AI credit spend stays bounded.

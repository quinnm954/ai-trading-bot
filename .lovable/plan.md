# Bake Kronos's skills and knowledge into the project

Today Kronos's playbook lives in his instructions, but everything he has learned (65 lessons, 58 self-made rules) lives only in the database. If that data were lost or an account reset, he'd start from zero. This plan makes his core knowledge permanent in the project itself.

## What changes
1. **Permanent playbook file** — a dedicated Kronos knowledge file holding his trading skills: swing entry checklist, exit geometry (net of fees, 1.6:1), tape gate logic, position sizing, when to hold cash, specialist hiring guidance, and risk rules. His instructions are built from this file instead of loose text.
2. **Snapshot his learned lessons and rules** — review the 65 lessons and 58 rules, remove duplicates and stale/temporary ones (e.g. the $625 cap set during the exit check), and write the durable ones into the project as built-in lessons and built-in rules.
3. **Built-in rules always enforced** — built-in rules are checked on every Kronos buy, alongside his live database rules, so they still apply on a fresh or reset account. He cannot retire built-in rules; he can still add and retire his own.
4. **Learning continues** — new lessons/rules still save to his memory as now. Later, more can be promoted into the built-in set on your request.

Unchanged: 30% hard floor, kill switch, mirroring, bots stay off.

## Technical details
- New `supabase/functions/_shared/kronos_knowledge.ts` exporting `PLAYBOOK`, `CORE_LESSONS`, `CORE_RULES` (same `rule_type`/`rule_params` shape as `commander_memory`).
- `_shared/commander.ts`: compose `SYSTEM` from `PLAYBOOK`; prepend `CORE_LESSONS` to loaded lessons; merge `CORE_RULES` into `checkRules`; `retire_rule` rejects core ids.
- Redeploy `agent-orchestrator` and `ai-trading-engine`; Deno check; record rule in AGENTS.md.

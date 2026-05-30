// Multi-agent orchestrator: runs one cycle of 5 specialized agents that
// communicate through the agent_messages bus.
//
//  watcher    → posts market observations
//  analyst    → reads signals + runs daily trade-audit/learning when due
//  risk       → validates the cycle against risk limits, may veto
//  trader     → if not vetoed, delegates execution to ai-trading-engine
//  healer     → audits the whole app (agents, edge functions, broker sync,
//               data integrity, RLS errors) and auto-remediates safe issues.
//               Absorbs former supervisor responsibilities + has expanded
//               code-aware diagnostic abilities.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type AgentName = "trader" | "analyst" | "watcher" | "risk" | "healer";

interface Ctx {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  authToken: string;
  log: Record<string, unknown>;
}

// ---------- bus helpers ----------
async function post(ctx: Ctx, from: AgentName, to: AgentName | "all", type: string, subject: string, payload: Record<string, unknown> = {}, priority: "low" | "normal" | "high" | "critical" = "normal") {
  await ctx.supabase.from("agent_messages").insert({
    user_id: ctx.userId,
    from_agent: from,
    to_agent: to,
    message_type: type,
    subject,
    payload,
    priority,
  });
}

async function setState(ctx: Ctx, agent: AgentName, status: string, task: string | null, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const { data: existing } = await ctx.supabase
    .from("agent_state").select("id, cycle_count, error_count")
    .eq("user_id", ctx.userId).eq("agent", agent).maybeSingle();

  const cycleInc = status === "working" ? 1 : 0;
  const errorInc = status === "error" ? 1 : 0;

  if (existing) {
    await ctx.supabase.from("agent_state").update({
      status, current_task: task, last_heartbeat: now,
      last_cycle_at: status === "working" ? now : undefined,
      cycle_count: (existing.cycle_count ?? 0) + cycleInc,
      error_count: (existing.error_count ?? 0) + errorInc,
      metadata: extra,
    }).eq("id", existing.id);
  } else {
    await ctx.supabase.from("agent_state").insert({
      user_id: ctx.userId, agent, status, current_task: task,
      last_heartbeat: now, last_cycle_at: now,
      cycle_count: cycleInc, error_count: errorInc, metadata: extra,
    });
  }
}

async function getOverride(ctx: Ctx, agent: AgentName) {
  const { data } = await ctx.supabase
    .from("agent_overrides").select("*")
    .eq("user_id", ctx.userId).eq("agent", agent).eq("active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

async function consumeOverride(ctx: Ctx, id: string) {
  await ctx.supabase.from("agent_overrides")
    .update({ active: false, consumed_at: new Date().toISOString() }).eq("id", id);
}

// ---------- WATCHER ----------
async function runWatcher(ctx: Ctx) {
  const pauseOv = await getOverride(ctx, "watcher");
  if (pauseOv?.override_type === "pause") {
    await setState(ctx, "watcher", "paused", "Paused by user override");
    return { skipped: true };
  }
  await setState(ctx, "watcher", "working", "Scanning market & open positions");

  const { data: positions } = await ctx.supabase
    .from("positions").select("symbol, side, quantity, avg_entry_price, current_price, unrealized_pnl, is_paper")
    .eq("user_id", ctx.userId);
  const { data: regime } = await ctx.supabase
    .from("ai_settings").select("current_regime, kill_switch_active, daily_loss_today, peak_equity")
    .eq("user_id", ctx.userId).maybeSingle();

  const openCount = positions?.length ?? 0;
  const totalUnrealized = (positions ?? []).reduce((s, p: any) => s + Number(p.unrealized_pnl ?? 0), 0);
  const obs = {
    regime: regime?.current_regime ?? "unknown",
    killSwitch: regime?.kill_switch_active ?? false,
    dailyLoss: Number(regime?.daily_loss_today ?? 0),
    openPositions: openCount,
    totalUnrealized: Number(totalUnrealized.toFixed(2)),
  };
  await post(ctx, "watcher", "analyst", "market_observation",
    `Regime ${obs.regime} • ${openCount} open • unrealized ${obs.totalUnrealized >= 0 ? "+" : ""}${obs.totalUnrealized.toFixed(2)}`, obs);
  await setState(ctx, "watcher", "idle", null, obs);
  return obs;
}

// ---------- ANALYST (now includes daily trade audit / self-learning) ----------
async function runAnalyst(ctx: Ctx, observation: Record<string, unknown>) {
  const pauseOv = await getOverride(ctx, "analyst");
  if (pauseOv?.override_type === "pause") {
    await setState(ctx, "analyst", "paused", "Paused by user override");
    return { skipped: true };
  }
  await setState(ctx, "analyst", "working", "Analyzing decisions & learning");

  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: decisions } = await ctx.supabase
    .from("ai_decisions").select("symbol, action, score, valid, reasoning, created_at")
    .eq("user_id", ctx.userId).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(20);

  const valid = (decisions ?? []).filter((d: any) => d.valid);
  const top = valid.slice(0, 3).map((d: any) => `${d.symbol} ${d.action} (${Number(d.score ?? 0).toFixed(0)})`).join(", ");

  // ---- DAILY AUDIT: run at most once per 23h, applies safe self-learning adjustments ----
  let auditSummary: any = null;
  const { data: stateRow } = await ctx.supabase
    .from("agent_state").select("metadata").eq("user_id", ctx.userId).eq("agent", "analyst").maybeSingle();
  const lastAuditAt = (stateRow?.metadata as any)?.lastAuditAt ? new Date((stateRow!.metadata as any).lastAuditAt).getTime() : 0;
  const dueForAudit = Date.now() - lastAuditAt > 23 * 3600 * 1000;
  if (dueForAudit) {
    auditSummary = await runDailyAudit(ctx);
    if (auditSummary) {
      await post(ctx, "analyst", "all", "audit_complete",
        `24h audit: ${auditSummary.total_trades} trades • WR ${auditSummary.win_rate.toFixed(0)}% • applied ${auditSummary.adjustments} adjustment(s)`,
        auditSummary, "normal");
    }
  }

  const summary = {
    last30m: decisions?.length ?? 0,
    validSignals: valid.length,
    topSignals: top || "none",
    observation,
    audit: auditSummary,
    lastAuditAt: dueForAudit ? new Date().toISOString() : (stateRow?.metadata as any)?.lastAuditAt ?? null,
  };
  await post(ctx, "analyst", "risk", "analysis_report",
    `${valid.length}/${decisions?.length ?? 0} valid signals in last 30m${top ? ` • top: ${top}` : ""}`, summary);
  await setState(ctx, "analyst", "idle", null, summary);
  return summary;
}

// ---- audit: condensed version of the old daily-trade-audit job ----
async function runDailyAudit(ctx: Ctx): Promise<any | null> {
  const periodStart = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: trades } = await ctx.supabase
    .from("trades")
    .select("id,symbol,strategy,pnl,exit_reason,closed_at")
    .eq("user_id", ctx.userId).eq("status", "closed")
    .gte("closed_at", periodStart).limit(500);
  const rows = (trades ?? []) as any[];
  if (rows.length === 0) return null;

  const losers = rows.filter((t) => (t.pnl ?? 0) < 0);
  const winners = rows.filter((t) => (t.pnl ?? 0) > 0);
  const totalPnl = rows.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const winRate = (winners.length / rows.length) * 100;

  // Per-strategy aggregation
  const perStrategy: Record<string, { trades: number; pnl: number; wins: number }> = {};
  for (const t of rows) {
    const k = t.strategy || "unknown";
    perStrategy[k] = perStrategy[k] || { trades: 0, pnl: 0, wins: 0 };
    perStrategy[k].trades++;
    perStrategy[k].pnl += t.pnl ?? 0;
    if ((t.pnl ?? 0) > 0) perStrategy[k].wins++;
  }

  // Apply safe deterministic adjustments to strategy_performance.score
  const { data: settingsRow } = await ctx.supabase
    .from("ai_settings").select("current_regime").eq("user_id", ctx.userId).maybeSingle();
  const currentRegime = (settingsRow?.current_regime as string) ?? null;
  let adjustments = 0;
  for (const [strategy, agg] of Object.entries(perStrategy)) {
    if (strategy === "unknown" || agg.trades < 3) continue;
    const wr = (agg.wins / agg.trades) * 100;
    let delta = 0;
    if (wr < 35) delta = -8;
    else if (wr >= 65) delta = +5;
    if (delta === 0) continue;
    const { data: perfRows } = await ctx.supabase
      .from("strategy_performance").select("id,score,market_regime")
      .eq("user_id", ctx.userId).eq("strategy", strategy);
    for (const r of perfRows ?? []) {
      const isCurrent = currentRegime && r.market_regime === currentRegime;
      const adj = isCurrent ? delta : Math.round(delta / 2);
      const next = Math.min(100, Math.max(5, Number(r.score) + adj));
      if (next === Number(r.score)) continue;
      await ctx.supabase.from("strategy_performance")
        .update({ score: next, updated_at: new Date().toISOString() }).eq("id", r.id);
      adjustments++;
    }
  }

  return {
    period_start: periodStart,
    total_trades: rows.length,
    wins: winners.length,
    losses: losers.length,
    win_rate: Number(winRate.toFixed(2)),
    total_pnl: Number(totalPnl.toFixed(4)),
    adjustments,
  };
}

// ---------- RISK ----------
async function runRisk(ctx: Ctx, analysis: Record<string, unknown>, observation: any) {
  const pauseOv = await getOverride(ctx, "risk");
  if (pauseOv?.override_type === "pause") {
    await setState(ctx, "risk", "paused", "Paused by user override");
    return { veto: false, reason: "risk agent paused" };
  }
  await setState(ctx, "risk", "working", "Validating cycle against risk limits");

  const { data: settings } = await ctx.supabase
    .from("ai_settings")
    .select("max_daily_loss, daily_loss_today, kill_switch_active, max_concurrent_trades, max_drawdown, current_drawdown, enabled")
    .eq("user_id", ctx.userId).maybeSingle();

  let veto = false;
  const reasons: string[] = [];
  if (!settings?.enabled) { veto = true; reasons.push("bot disabled"); }
  if (settings?.kill_switch_active) { veto = true; reasons.push("kill switch active"); }
  if (settings?.max_daily_loss && Number(settings.daily_loss_today ?? 0) >= Number(settings.max_daily_loss)) {
    veto = true; reasons.push(`daily loss ${settings.daily_loss_today}% ≥ limit ${settings.max_daily_loss}%`);
  }
  if (settings?.max_drawdown && Number(settings.current_drawdown ?? 0) >= Number(settings.max_drawdown)) {
    veto = true; reasons.push(`drawdown ${settings.current_drawdown}% ≥ limit ${settings.max_drawdown}%`);
  }
  if (observation?.openPositions >= (settings?.max_concurrent_trades ?? 99)) {
    reasons.push(`at concurrency cap ${settings?.max_concurrent_trades}`);
  }
  const userVeto = await getOverride(ctx, "trader");
  if (userVeto?.override_type === "veto_next") {
    veto = true; reasons.push("user veto on trader");
    await consumeOverride(ctx, userVeto.id);
  }

  const result = { veto, reasons, analysis };
  await post(ctx, "risk", "trader",
    veto ? "veto" : "approval",
    veto ? `Trade cycle vetoed: ${reasons.join("; ")}` : `Trade cycle approved${reasons.length ? ` (notes: ${reasons.join("; ")})` : ""}`,
    result, veto ? "high" : "normal");
  await setState(ctx, "risk", "idle", null, result as any);
  return result;
}

// ---------- TRADER ----------
async function runTrader(ctx: Ctx, riskResult: { veto: boolean; reasons: string[] }) {
  const pauseOv = await getOverride(ctx, "trader");
  if (pauseOv?.override_type === "pause") {
    await setState(ctx, "trader", "paused", "Paused by user override");
    return { skipped: true };
  }
  if (riskResult.veto) {
    await setState(ctx, "trader", "waiting", `Vetoed: ${riskResult.reasons.join("; ")}`);
    return { skipped: true, reason: "vetoed" };
  }
  await setState(ctx, "trader", "working", "Invoking trade engine");

  const url = `${SUPABASE_URL}/functions/v1/ai-trading-engine`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ctx.authToken}`,
        // when invoked via cron we use service role; pass user id explicitly
        "x-user-id": ctx.userId,
      },
      body: JSON.stringify({ user_id: ctx.userId }),
    });
    const body = await resp.json().catch(() => ({}));
    const executed = Array.isArray(body?.executedTrades) ? body.executedTrades.length : 0;
    await post(ctx, "trader", "all", executed > 0 ? "trades_executed" : "no_trades",
      executed > 0 ? `Executed ${executed} trade(s)` : `No trades this cycle${body?.reason ? ` (${body.reason})` : ""}`,
      { executed, status: resp.status, regime: body?.regime, reason: body?.reason },
      executed > 0 ? "high" : "low");
    await setState(ctx, "trader", "idle", null, { lastExecuted: executed, lastStatus: resp.status });
    return { executed, status: resp.status, body };
  } catch (e) {
    await setState(ctx, "trader", "error", `Engine call failed: ${(e as Error).message}`);
    await post(ctx, "trader", "healer", "agent_error", `Trader failed to invoke engine: ${(e as Error).message}`, { error: String(e) }, "critical");
    return { error: String(e) };
  }
}

// ---------- HEALER (knowledge-base driven) ----------
type Remedy = {
  id: string; user_id: string | null; remedy_key: string; description: string;
  match_type: string; match_pattern: string; action: string;
  action_params: Record<string, any>; enabled: boolean;
  success_count: number; failure_count: number; confidence: number;
  last_outcome: string | null; last_applied_at: string | null;
};

async function loadRemedies(ctx: Ctx): Promise<Map<string, Remedy>> {
  const { data } = await ctx.supabase.from("healer_remedies").select("*")
    .or(`user_id.eq.${ctx.userId},user_id.is.null`).eq("enabled", true);
  const map = new Map<string, Remedy>();
  for (const r of (data ?? []) as Remedy[]) {
    const existing = map.get(r.remedy_key);
    if (!existing || (r.user_id && !existing.user_id)) map.set(r.remedy_key, r);
  }
  return map;
}

async function recordOutcome(ctx: Ctx, remedy: Remedy, outcome: "success" | "failure" | "pending", note?: string) {
  const success = remedy.success_count + (outcome === "success" ? 1 : 0);
  const failure = remedy.failure_count + (outcome === "failure" ? 1 : 0);
  const total = success + failure;
  const confidence = total > 0 ? Math.round((success / total) * 100 * 100) / 100 : remedy.confidence;
  if (!remedy.user_id) {
    await ctx.supabase.from("healer_remedies").upsert({
      user_id: ctx.userId, remedy_key: remedy.remedy_key, description: remedy.description,
      match_type: remedy.match_type, match_pattern: remedy.match_pattern, action: remedy.action,
      action_params: remedy.action_params, enabled: true,
      success_count: success, failure_count: failure,
      last_applied_at: new Date().toISOString(), last_outcome: outcome,
      confidence, notes: note ?? null,
    }, { onConflict: "user_id,remedy_key" });
  } else {
    await ctx.supabase.from("healer_remedies").update({
      success_count: success, failure_count: failure,
      last_applied_at: new Date().toISOString(), last_outcome: outcome,
      confidence, notes: note ?? null,
    }).eq("id", remedy.id);
  }
}

async function verifyPreviousOutcomes(ctx: Ctx, remedies: Map<string, Remedy>) {
  const learned: string[] = [];
  for (const remedy of remedies.values()) {
    if (remedy.last_outcome !== "pending" || !remedy.last_applied_at) continue;
    const ageMin = (Date.now() - new Date(remedy.last_applied_at).getTime()) / 60_000;
    if (ageMin < 5) continue;
    const { data: recur } = await ctx.supabase.from("agent_incidents").select("id")
      .eq("user_id", ctx.userId).eq("incident_type", remedy.remedy_key)
      .gte("created_at", remedy.last_applied_at).limit(1);
    const reoccurred = (recur?.length ?? 0) > 0;
    await recordOutcome(ctx, remedy, reoccurred ? "failure" : "success",
      reoccurred ? `recurred within ${ageMin.toFixed(0)}m` : `clear for ${ageMin.toFixed(0)}m`);
    learned.push(`${remedy.remedy_key}=${reoccurred ? "failure" : "success"}`);
  }
  return learned;
}

async function applyAction(ctx: Ctx, remedy: Remedy, detection: any): Promise<{ ok: boolean; note: string }> {
  try {
    switch (remedy.action) {
      case "expire_stale_pending_trades": {
        const ids: string[] = detection?.ids ?? [];
        if (ids.length === 0) return { ok: true, note: "nothing to expire" };
        await ctx.supabase.from("pending_trades").update({ status: "expired" }).in("id", ids);
        return { ok: true, note: `expired ${ids.length}` };
      }
      case "reset_stuck_agents": {
        const ids: string[] = detection?.ids ?? [];
        for (const id of ids) {
          await ctx.supabase.from("agent_state")
            .update({ status: "idle", current_task: "reset by healer (stuck)" }).eq("id", id);
        }
        return { ok: true, note: `reset ${ids.length} agents` };
      }
      case "disable_ai_autonomous_mode": {
        await ctx.supabase.from("ai_settings").update({ ai_autonomous_mode: false }).eq("user_id", ctx.userId);
        return { ok: true, note: "switched to rule-based fallback" };
      }
      case "pause_trader_temporarily": {
        const minutes = Number(remedy.action_params?.pause_minutes ?? 15);
        await ctx.supabase.from("agent_overrides").insert({
          user_id: ctx.userId, agent: "trader", override_type: "pause",
          payload: { reason: `Auto-paused by healer for ${minutes}m` }, active: true,
        });
        return { ok: true, note: `paused trader ${minutes}m` };
      }
      case "alert_broker_sync": {
        await post(ctx, "healer", "all", "incident",
          "Broker sync failing — check Coinbase API credentials & rate limits", detection ?? {}, "critical");
        return { ok: true, note: "alerted user" };
      }
      case "advise_loosen_filters": {
        await post(ctx, "healer", "all", "advisory",
          "Extended standstill — consider loosening filters or waiting for regime shift", detection ?? {}, "normal");
        return { ok: true, note: "advisory posted" };
      }
      case "propose_kill_switch_release": {
        await post(ctx, "healer", "risk", "advisory",
          "Daily loss recovered — kill switch can be safely released", detection ?? {}, "high");
        return { ok: true, note: "release proposed" };
      }
      case "reconcile_orphan_trades": {
        const ids: string[] = detection?.sample_ids ?? [];
        if (ids.length === 0) return { ok: true, note: "nothing to reconcile" };
        await ctx.supabase.from("trades")
          .update({ status: "cancelled", closed_at: new Date().toISOString(), exit_reason: "healer_orphan_reconcile" })
          .in("id", ids);
        return { ok: true, note: `reconciled ${ids.length} orphan trades` };
      }
      case "release_kill_switch": {
        await ctx.supabase.from("ai_settings")
          .update({ kill_switch_active: false, kill_switch_triggered_at: null })
          .eq("user_id", ctx.userId);
        return { ok: true, note: "kill switch released" };
      }
      case "alert_schema_drift": {
        await post(ctx, "healer", "all", "incident",
          "Code references a missing column/table — schema drift detected. Review recent migrations.",
          detection ?? {}, "critical");
        return { ok: true, note: "schema drift alert posted" };
      }
      case "alert_rls_error": {
        await post(ctx, "healer", "all", "incident",
          "RLS / permission denial detected — verify policies & GRANTs for affected tables.",
          detection ?? {}, "critical");
        return { ok: true, note: "rls alert posted" };
      }
      case "bootstrap_missing_agents": {
        const missing: string[] = detection?.missing ?? [];
        for (const agent of missing) {
          await ctx.supabase.from("agent_state").insert({
            user_id: ctx.userId, agent, status: "idle",
            current_task: "bootstrapped by healer", last_heartbeat: new Date().toISOString(),
          });
        }
        return { ok: true, note: `bootstrapped ${missing.length} agent rows` };
      }
      default: return { ok: false, note: `unknown action ${remedy.action}` };
    }
  } catch (e) {
    return { ok: false, note: `action failed: ${(e as Error).message}` };
  }
}

async function detectIssues(ctx: Ctx) {
  const issues: Array<{ key: string; detection: any; description: string }> = [];
  const now = Date.now();

  // ----- A. Trade lifecycle ----------------------------------------------
  const { data: stale } = await ctx.supabase.from("pending_trades")
    .select("id").eq("user_id", ctx.userId).eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  if (stale && stale.length > 0) {
    issues.push({ key: "stuck_pending_trades", description: `${stale.length} pending trades expired`,
      detection: { ids: stale.map((s: any) => s.id), count: stale.length } });
  }

  // ----- B. Agent health (was supervisor) --------------------------------
  const stuckCutoff = new Date(now - 5 * 60 * 1000).toISOString();
  const { data: stuck } = await ctx.supabase.from("agent_state")
    .select("id, agent, last_heartbeat")
    .eq("user_id", ctx.userId).eq("status", "working").lt("last_heartbeat", stuckCutoff);
  if (stuck && stuck.length > 0) {
    issues.push({ key: "stuck_agent_working", description: `${stuck.length} agent(s) stuck`,
      detection: { ids: stuck.map((s: any) => s.id), agents: stuck.map((s: any) => s.agent) } });
  }

  const { data: states } = await ctx.supabase.from("agent_state")
    .select("id, agent, status, last_heartbeat, last_cycle_at")
    .eq("user_id", ctx.userId);
  const { data: settings } = await ctx.supabase
    .from("ai_settings").select("enabled, trading_mode, kill_switch_active, daily_loss_today, peak_equity")
    .eq("user_id", ctx.userId).maybeSingle();
  const botEnabled = !!settings?.enabled;

  const REQUIRED: AgentName[] = ["watcher", "analyst", "risk", "trader", "healer"];
  const present = new Set((states ?? []).map((s: any) => s.agent));
  const missing = REQUIRED.filter((a) => !present.has(a));
  if (missing.length > 0) {
    issues.push({ key: "missing_agent_rows", description: `Missing agent rows: ${missing.join(", ")}`,
      detection: { missing } });
  }

  if (botEnabled) {
    const staleAgents = (states ?? []).filter((s: any) => {
      const age = (now - new Date(s.last_heartbeat).getTime()) / 60_000;
      return age > 35; // > one cycle interval
    });
    if (staleAgents.length > 0) {
      issues.push({ key: "supervisor_stale_agent", description: `${staleAgents.length} agent(s) heartbeat >35m old`,
        detection: { ids: staleAgents.map((s: any) => s.id), agents: staleAgents.map((s: any) => s.agent) } });
    }
    const trader = (states ?? []).find((s: any) => s.agent === "trader");
    if (trader && trader.status !== "paused") {
      const lastCycle = trader.last_cycle_at ? new Date(trader.last_cycle_at).getTime() : 0;
      const ageMin = (now - lastCycle) / 60_000;
      if (ageMin > 90) {
        issues.push({ key: "supervisor_trader_silent", description: `Trader has not cycled for ${ageMin.toFixed(0)}m`,
          detection: { ageMin } });
      }
    }
  }

  // ----- C. Repeated errors / AI budget ----------------------------------
  const since30 = new Date(now - 30 * 60 * 1000).toISOString();
  const { data: traderErr } = await ctx.supabase.from("agent_messages")
    .select("payload, subject, created_at")
    .eq("user_id", ctx.userId).eq("from_agent", "trader").eq("message_type", "agent_error")
    .gte("created_at", since30);
  if (traderErr && traderErr.length >= 3) {
    issues.push({ key: "repeated_trader_errors", description: `${traderErr.length} trader errors in 30m`,
      detection: { count: traderErr.length, samples: traderErr.slice(0, 3) } });
  }
  const errBlob = JSON.stringify(traderErr ?? []);
  if (/payment_required|402|Not enough credits/i.test(errBlob)) {
    issues.push({ key: "ai_credits_exhausted", description: "AI Gateway out of credits",
      detection: { evidence: "402/payment_required" } });
  }
  // Code-aware: detect RLS denials / permission errors surfacing in agent messages
  if (/row-level security|permission denied|RLS|42501/i.test(errBlob)) {
    issues.push({ key: "rls_or_permission_error", description: "RLS / permission denials detected in trader errors",
      detection: { samples: (traderErr ?? []).slice(0, 3) } });
  }
  // Code-aware: detect schema / column-missing errors
  if (/column .* does not exist|relation .* does not exist|42P01|42703/i.test(errBlob)) {
    issues.push({ key: "schema_drift_detected", description: "Schema drift: missing column or relation referenced in code",
      detection: { samples: (traderErr ?? []).slice(0, 3) } });
  }

  // ----- D. Broker / live-mode connectivity ------------------------------
  if (settings?.trading_mode === "live") {
    const { data: live } = await ctx.supabase.from("live_account")
      .select("last_synced_at").eq("user_id", ctx.userId).maybeSingle();
    if (live?.last_synced_at) {
      const ageMin = (now - new Date(live.last_synced_at).getTime()) / 60_000;
      if (ageMin > 60) {
        issues.push({ key: "broker_sync_stale", description: `Live account not synced for ${ageMin.toFixed(0)}m`,
          detection: { ageMin } });
      }
    } else {
      issues.push({ key: "broker_sync_stale", description: "Live mode enabled but live_account never synced",
        detection: { ageMin: null } });
    }
  }

  // ----- E. Data integrity: orphan positions / drifted paper balance ----
  const { data: orphans } = await ctx.supabase.from("trades")
    .select("id").eq("user_id", ctx.userId).eq("status", "open")
    .lt("created_at", new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString())
    .limit(50);
  if (orphans && orphans.length > 10) {
    issues.push({ key: "orphan_open_trades", description: `${orphans.length}+ trades stuck "open" >7 days`,
      detection: { count: orphans.length, sample_ids: orphans.slice(0, 10).map((o: any) => o.id) } });
  }

  // ----- F. Kill-switch sanity ------------------------------------------
  if (settings?.kill_switch_active && Number(settings?.daily_loss_today ?? 0) <= 0) {
    issues.push({ key: "kill_switch_stuck", description: "Kill switch active but daily loss is zero/positive",
      detection: { daily_loss_today: settings?.daily_loss_today } });
  }

  return issues;
}

async function runHealer(ctx: Ctx) {
  const pauseOv = await getOverride(ctx, "healer");
  if (pauseOv?.override_type === "pause") {
    await setState(ctx, "healer", "paused", "Paused by user override");
    return { skipped: true };
  }
  await setState(ctx, "healer", "working", "Learning from errors & applying remedies");
  const remedies = await loadRemedies(ctx);
  const learned = await verifyPreviousOutcomes(ctx, remedies);
  const refreshed = await loadRemedies(ctx);
  const issues = await detectIssues(ctx);
  const applied: string[] = [];
  for (const issue of issues) {
    const remedy = refreshed.get(issue.key);
    if (!remedy) {
      await ctx.supabase.from("agent_incidents").insert({
        user_id: ctx.userId, incident_type: issue.key, severity: "warning",
        description: issue.description, context: issue.detection, remediation: "no remedy registered",
      });
      continue;
    }
    if ((remedy.success_count + remedy.failure_count) >= 5 && remedy.confidence < 25) {
      applied.push(`skipped ${remedy.remedy_key} (low confidence ${remedy.confidence}%)`);
      continue;
    }
    const result = await applyAction(ctx, remedy, issue.detection);
    await ctx.supabase.from("agent_incidents").insert({
      user_id: ctx.userId, incident_type: issue.key,
      severity: result.ok ? "info" : "error",
      description: issue.description, context: issue.detection,
      remediation: `${remedy.action}: ${result.note}`,
      resolved: result.ok, resolved_at: result.ok ? new Date().toISOString() : null,
    });
    const immediate = ["expire_stale_pending_trades", "reset_stuck_agents", "alert_broker_sync", "advise_loosen_filters", "propose_kill_switch_release"];
    await recordOutcome(ctx, remedy,
      result.ok ? (immediate.includes(remedy.action) ? "success" : "pending") : "failure", result.note);
    applied.push(`${remedy.remedy_key}→${remedy.action} (${result.note})`);
  }
  const summary = { detected: issues.length, applied: applied.length, learned, actions: applied };
  if (applied.length > 0) {
    await post(ctx, "healer", "all", "self_heal",
      `Applied ${applied.length} remedy(ies): ${applied.join("; ")}`, summary, "high");
  } else {
    await post(ctx, "healer", "all", "health_check",
      learned.length > 0 ? `No issues; updated: ${learned.join(", ")}` : "All agents healthy", summary, "low");
  }
  await setState(ctx, "healer", "idle", null, summary);
  return summary;
}

// ---------- ONE CYCLE ----------
async function runOneCycle(ctx: Ctx) {
  const observation = await runWatcher(ctx);
  const analysis = await runAnalyst(ctx, observation as any);
  const risk = await runRisk(ctx, analysis as any, observation);
  const trade = await runTrader(ctx, risk as any);
  const heal = await runHealer(ctx);
  return { observation, analysis, risk, trade, heal };
}

// ---------- main ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE);

    let userIds: string[] = [];
    let bodyJson: any = {};
    try { bodyJson = await req.json(); } catch { /* ignore */ }

    // Try user JWT first; fall back to cron mode (anon or service-role caller)
    let userMode = false;
    if (token && token !== SERVICE_ROLE && token !== ANON_KEY) {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await userClient.auth.getUser(token);
      if (user) { userIds = [user.id]; userMode = true; }
    }
    if (!userMode) {
      if (bodyJson?.user_id) {
        userIds = [bodyJson.user_id];
      } else {
        const { data } = await adminClient.from("ai_settings").select("user_id").eq("enabled", true);
        userIds = (data ?? []).map((r: any) => r.user_id).filter(Boolean);
      }
    }

    const results: Record<string, any> = {};
    for (const uid of userIds) {
      try {
        // Use service-role client for DB; trader still calls ai-trading-engine with the
        // service-role token so RLS-bypass + per-user routing works in cron mode.
        const ctx: Ctx = { supabase: adminClient, userId: uid, authToken: SERVICE_ROLE, log: {} };
        results[uid] = await runOneCycle(ctx);
      } catch (e) {
        console.error(`cycle failed for ${uid}`, e);
        results[uid] = { error: (e as Error).message };
      }
    }

    return new Response(JSON.stringify({
      ok: true, mode: userMode ? "manual" : "cron",
      users: userIds.length, results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("agent-orchestrator error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

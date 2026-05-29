// Multi-agent orchestrator: runs one cycle of 5 specialized agents that
// communicate through the agent_messages bus.
//
//  watcher  → posts market observations
//  analyst  → reads observations + AI decisions, posts analysis
//  risk     → validates the cycle against risk limits, may veto
//  trader   → if not vetoed, delegates execution to ai-trading-engine
//  healer   → scans recent errors/state, auto-remediates safe issues

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    .from("agent_state")
    .select("id, cycle_count, error_count")
    .eq("user_id", ctx.userId)
    .eq("agent", agent)
    .maybeSingle();

  const cycleInc = status === "working" ? 1 : 0;
  const errorInc = status === "error" ? 1 : 0;

  if (existing) {
    await ctx.supabase
      .from("agent_state")
      .update({
        status,
        current_task: task,
        last_heartbeat: now,
        last_cycle_at: status === "working" ? now : undefined,
        cycle_count: (existing.cycle_count ?? 0) + cycleInc,
        error_count: (existing.error_count ?? 0) + errorInc,
        metadata: extra,
      })
      .eq("id", existing.id);
  } else {
    await ctx.supabase.from("agent_state").insert({
      user_id: ctx.userId,
      agent,
      status,
      current_task: task,
      last_heartbeat: now,
      last_cycle_at: now,
      cycle_count: cycleInc,
      error_count: errorInc,
      metadata: extra,
    });
  }
}

async function getOverride(ctx: Ctx, agent: AgentName) {
  const { data } = await ctx.supabase
    .from("agent_overrides")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("agent", agent)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function consumeOverride(ctx: Ctx, id: string) {
  await ctx.supabase
    .from("agent_overrides")
    .update({ active: false, consumed_at: new Date().toISOString() })
    .eq("id", id);
}

// ---------- WATCHER: scans market + position context ----------
async function runWatcher(ctx: Ctx) {
  const pauseOv = await getOverride(ctx, "watcher");
  if (pauseOv?.override_type === "pause") {
    await setState(ctx, "watcher", "paused", "Paused by user override");
    return { skipped: true };
  }
  await setState(ctx, "watcher", "working", "Scanning market & open positions");

  const { data: positions } = await ctx.supabase
    .from("positions")
    .select("symbol, side, quantity, avg_entry_price, current_price, unrealized_pnl, is_paper")
    .eq("user_id", ctx.userId);

  const { data: regime } = await ctx.supabase
    .from("ai_settings")
    .select("current_regime, kill_switch_active, daily_loss_today, peak_equity")
    .eq("user_id", ctx.userId)
    .maybeSingle();

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
    `Regime ${obs.regime} • ${openCount} open • unrealized ${obs.totalUnrealized >= 0 ? "+" : ""}${obs.totalUnrealized.toFixed(2)}`,
    obs);

  await setState(ctx, "watcher", "idle", null, obs);
  return obs;
}

// ---------- ANALYST: pulls recent AI decisions + trades, posts summary ----------
async function runAnalyst(ctx: Ctx, observation: Record<string, unknown>) {
  const pauseOv = await getOverride(ctx, "analyst");
  if (pauseOv?.override_type === "pause") {
    await setState(ctx, "analyst", "paused", "Paused by user override");
    return { skipped: true };
  }
  await setState(ctx, "analyst", "working", "Analyzing recent decisions");

  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: decisions } = await ctx.supabase
    .from("ai_decisions")
    .select("symbol, action, score, valid, reasoning, created_at")
    .eq("user_id", ctx.userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);

  const valid = (decisions ?? []).filter((d: any) => d.valid);
  const top = valid.slice(0, 3).map((d: any) => `${d.symbol} ${d.action} (${Number(d.score ?? 0).toFixed(0)})`).join(", ");

  const summary = {
    last30m: decisions?.length ?? 0,
    validSignals: valid.length,
    topSignals: top || "none",
    observation,
  };

  await post(ctx, "analyst", "risk", "analysis_report",
    `${valid.length}/${decisions?.length ?? 0} valid signals in last 30m${top ? ` • top: ${top}` : ""}`,
    summary);

  await setState(ctx, "analyst", "idle", null, summary);
  return summary;
}

// ---------- RISK: checks if the cycle should proceed ----------
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
    .eq("user_id", ctx.userId)
    .maybeSingle();

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
    // not a veto — trader is allowed to manage existing positions
  }

  const userVeto = await getOverride(ctx, "trader");
  if (userVeto?.override_type === "veto_next") {
    veto = true;
    reasons.push("user veto on trader");
    await consumeOverride(ctx, userVeto.id);
  }

  const result = { veto, reasons, analysis };
  await post(ctx, "risk", "trader",
    veto ? "veto" : "approval",
    veto ? `Trade cycle vetoed: ${reasons.join("; ")}` : `Trade cycle approved${reasons.length ? ` (notes: ${reasons.join("; ")})` : ""}`,
    result,
    veto ? "high" : "normal");

  await setState(ctx, "risk", "idle", null, result as any);
  return result;
}

// ---------- TRADER: executes by invoking the existing engine ----------
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

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-trading-engine`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ctx.authToken}`,
      },
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

// ---------- HEALER: learns from errors and applies remedies ----------
//
// Flow per cycle:
//  1. Load remedy knowledge base (user-tuned overrides + global defaults).
//  2. Verify outcome of last cycle's pending remedies (learn: success/failure).
//  3. Detect current issues by matching conditions + recent error messages.
//  4. For each detected issue, look up best remedy by confidence and apply it.
//  5. Record outcome and bump confidence on the remedy row.

type Remedy = {
  id: string;
  user_id: string | null;
  remedy_key: string;
  description: string;
  match_type: string;
  match_pattern: string;
  action: string;
  action_params: Record<string, any>;
  enabled: boolean;
  success_count: number;
  failure_count: number;
  confidence: number;
  last_outcome: string | null;
  last_applied_at: string | null;
};

async function loadRemedies(ctx: Ctx): Promise<Map<string, Remedy>> {
  const { data } = await ctx.supabase
    .from("healer_remedies")
    .select("*")
    .or(`user_id.eq.${ctx.userId},user_id.is.null`)
    .eq("enabled", true);
  // Prefer user-tuned over global default for same remedy_key
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

  // If global default, clone into user-scoped row to track per-user learning
  if (!remedy.user_id) {
    await ctx.supabase.from("healer_remedies").upsert({
      user_id: ctx.userId,
      remedy_key: remedy.remedy_key,
      description: remedy.description,
      match_type: remedy.match_type,
      match_pattern: remedy.match_pattern,
      action: remedy.action,
      action_params: remedy.action_params,
      enabled: true,
      success_count: success,
      failure_count: failure,
      last_applied_at: new Date().toISOString(),
      last_outcome: outcome,
      confidence,
      notes: note ?? null,
    }, { onConflict: "user_id,remedy_key" });
  } else {
    await ctx.supabase.from("healer_remedies").update({
      success_count: success,
      failure_count: failure,
      last_applied_at: new Date().toISOString(),
      last_outcome: outcome,
      confidence,
      notes: note ?? remedy.notes,
    }).eq("id", remedy.id);
  }
}

// Verify last cycle's pending remedies: if the same incident type does NOT
// reoccur within the recheck window, count as success; else failure.
async function verifyPreviousOutcomes(ctx: Ctx, remedies: Map<string, Remedy>) {
  const learned: string[] = [];
  for (const remedy of remedies.values()) {
    if (remedy.last_outcome !== "pending" || !remedy.last_applied_at) continue;
    const appliedAt = new Date(remedy.last_applied_at).getTime();
    const ageMin = (Date.now() - appliedAt) / 60_000;
    if (ageMin < 5) continue; // give it time

    // Look for a new incident of the same type since application
    const { data: recur } = await ctx.supabase
      .from("agent_incidents")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("incident_type", remedy.remedy_key)
      .gte("created_at", remedy.last_applied_at)
      .limit(1);

    const reoccurred = (recur?.length ?? 0) > 0;
    await recordOutcome(ctx, remedy, reoccurred ? "failure" : "success",
      reoccurred ? `recurred within ${ageMin.toFixed(0)}m` : `clear for ${ageMin.toFixed(0)}m`);
    learned.push(`${remedy.remedy_key}=${reoccurred ? "failure" : "success"}`);
  }
  return learned;
}

// ---- ACTIONS ----
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
            .update({ status: "idle", current_task: "reset by healer (stuck)" })
            .eq("id", id);
        }
        return { ok: true, note: `reset ${ids.length} agents` };
      }
      case "disable_ai_autonomous_mode": {
        await ctx.supabase.from("ai_settings")
          .update({ ai_autonomous_mode: false })
          .eq("user_id", ctx.userId);
        return { ok: true, note: "switched to rule-based fallback (ai_autonomous_mode=false)" };
      }
      case "pause_trader_temporarily": {
        const minutes = Number(remedy.action_params?.pause_minutes ?? 15);
        await ctx.supabase.from("agent_overrides").insert({
          user_id: ctx.userId,
          agent: "trader",
          override_type: "pause",
          reason: `Auto-paused by healer for ${minutes}m (repeated errors)`,
          active: true,
        });
        return { ok: true, note: `paused trader ${minutes}m` };
      }
      case "alert_broker_sync": {
        await post(ctx, "healer", "all", "incident",
          "Broker sync failing — check Coinbase API credentials & rate limits",
          detection ?? {}, "critical");
        return { ok: true, note: "alerted user" };
      }
      case "advise_loosen_filters": {
        await post(ctx, "healer", "all", "advisory",
          "Extended standstill in volatile regime — consider loosening entry filters or waiting for regime shift",
          detection ?? {}, "normal");
        return { ok: true, note: "advisory posted" };
      }
      case "propose_kill_switch_release": {
        await post(ctx, "healer", "risk", "advisory",
          "Daily loss recovered below 50% of limit — kill switch can be safely released",
          detection ?? {}, "high");
        return { ok: true, note: "release proposed" };
      }
      default:
        return { ok: false, note: `unknown action ${remedy.action}` };
    }
  } catch (e) {
    return { ok: false, note: `action failed: ${(e as Error).message}` };
  }
}

// ---- DETECTORS ----
async function detectIssues(ctx: Ctx) {
  const issues: Array<{ key: string; detection: any; description: string }> = [];

  // stuck pending trades
  const { data: stale } = await ctx.supabase
    .from("pending_trades")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  if (stale && stale.length > 0) {
    issues.push({ key: "stuck_pending_trades", description: `${stale.length} pending trades expired`,
      detection: { ids: stale.map((s: any) => s.id), count: stale.length } });
  }

  // stuck working agents > 5m
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: stuck } = await ctx.supabase
    .from("agent_state")
    .select("id, agent, last_heartbeat")
    .eq("user_id", ctx.userId)
    .eq("status", "working")
    .lt("last_heartbeat", stuckCutoff);
  if (stuck && stuck.length > 0) {
    issues.push({ key: "stuck_agent_working", description: `${stuck.length} agent(s) stuck`,
      detection: { ids: stuck.map((s: any) => s.id), agents: stuck.map((s: any) => s.agent) } });
  }

  // recent trader errors (look at messages last 10m)
  const since10 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: traderErr } = await ctx.supabase
    .from("agent_messages")
    .select("payload, subject, created_at")
    .eq("user_id", ctx.userId)
    .eq("from_agent", "trader")
    .eq("message_type", "agent_error")
    .gte("created_at", since10);
  if (traderErr && traderErr.length >= 3) {
    issues.push({ key: "repeated_trader_errors", description: `${traderErr.length} trader errors in 10m`,
      detection: { count: traderErr.length, samples: traderErr.slice(0, 3) } });
  }

  // AI credits exhausted — scan recent error payloads for "payment_required" or "402"
  const errorBlob = JSON.stringify(traderErr ?? []);
  if (/payment_required|402|Not enough credits/i.test(errorBlob)) {
    issues.push({ key: "ai_credits_exhausted", description: "AI Gateway out of credits",
      detection: { evidence: "402/payment_required in recent trader errors" } });
  }

  // Volatile-regime standstill: 6 cycles, no trades_executed, regime=volatile
  const { data: recentTrades } = await ctx.supabase
    .from("agent_messages")
    .select("message_type, payload, created_at")
    .eq("user_id", ctx.userId)
    .eq("from_agent", "trader")
    .in("message_type", ["trades_executed", "no_trades"])
    .order("created_at", { ascending: false })
    .limit(6);
  if (recentTrades && recentTrades.length >= 6) {
    const noneExecuted = recentTrades.every((m: any) => m.message_type === "no_trades");
    const anyVolatile = recentTrades.some((m: any) => /volatil/i.test(JSON.stringify(m.payload ?? {})));
    if (noneExecuted && anyVolatile) {
      issues.push({ key: "volatile_standstill", description: "6 cycles no trades in volatile regime",
        detection: { cycles: 6 } });
    }
  }

  // Kill switch recovery
  const { data: settings } = await ctx.supabase
    .from("ai_settings")
    .select("kill_switch_active, daily_loss_today, max_daily_loss")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (settings?.kill_switch_active && settings?.max_daily_loss) {
    const ratio = Number(settings.daily_loss_today ?? 0) / Number(settings.max_daily_loss);
    if (ratio < 0.5) {
      issues.push({ key: "kill_switch_auto_recovery", description: "kill switch on but loss recovered",
        detection: { ratio: ratio.toFixed(2) } });
    }
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
  // reload after outcome writes so learning is current
  const refreshed = await loadRemedies(ctx);

  const issues = await detectIssues(ctx);
  const applied: string[] = [];

  for (const issue of issues) {
    const remedy = refreshed.get(issue.key);
    if (!remedy) {
      await ctx.supabase.from("agent_incidents").insert({
        user_id: ctx.userId,
        incident_type: issue.key,
        severity: "warning",
        description: issue.description,
        context: issue.detection,
        remediation: "no remedy registered",
      });
      continue;
    }
    // Skip remedies the healer has learned not to trust (confidence < 25 after 5+ attempts)
    if ((remedy.success_count + remedy.failure_count) >= 5 && remedy.confidence < 25) {
      applied.push(`skipped ${remedy.remedy_key} (low confidence ${remedy.confidence}%)`);
      continue;
    }

    const result = await applyAction(ctx, remedy, issue.detection);
    await ctx.supabase.from("agent_incidents").insert({
      user_id: ctx.userId,
      incident_type: issue.key,
      severity: result.ok ? "info" : "error",
      description: issue.description,
      context: issue.detection,
      remediation: `${remedy.action}: ${result.note}`,
      resolved: result.ok,
      resolved_at: result.ok ? new Date().toISOString() : null,
    });

    // Immediate-resolution remedies → record success now; others → pending (verified next cycle)
    const immediate = ["expire_stale_pending_trades", "reset_stuck_agents", "alert_broker_sync", "advise_loosen_filters", "propose_kill_switch_release"];
    await recordOutcome(ctx, remedy,
      result.ok ? (immediate.includes(remedy.action) ? "success" : "pending") : "failure",
      result.note);

    applied.push(`${remedy.remedy_key}→${remedy.action} (${result.note}, conf ${remedy.confidence}%)`);
  }

  const summary = {
    detected: issues.length,
    applied: applied.length,
    learned,
    actions: applied,
  };

  if (applied.length > 0) {
    await post(ctx, "healer", "all", "self_heal",
      `Applied ${applied.length} learned remedy(ies): ${applied.join("; ")}`, summary, "high");
  } else if (learned.length > 0) {
    await post(ctx, "healer", "all", "health_check",
      `No issues; updated knowledge: ${learned.join(", ")}`, summary, "low");
  } else {
    await post(ctx, "healer", "all", "health_check", "All agents healthy", summary, "low");
  }

  await setState(ctx, "healer", "idle", null, summary);
  return summary;
}

// ---------- main ----------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return new Response(JSON.stringify({ error: "invalid user" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const ctx: Ctx = { supabase, userId: user.id, authToken: token, log: {} };

    const observation = await runWatcher(ctx);
    const analysis = await runAnalyst(ctx, observation as any);
    const risk = await runRisk(ctx, analysis as any, observation);
    const trade = await runTrader(ctx, risk as any);
    const heal = await runHealer(ctx);

    return new Response(JSON.stringify({
      ok: true,
      cycle: { observation, analysis, risk, trade, heal },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("agent-orchestrator error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

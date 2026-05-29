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

// ---------- HEALER: detects & auto-fixes safe issues ----------
async function runHealer(ctx: Ctx) {
  const pauseOv = await getOverride(ctx, "healer");
  if (pauseOv?.override_type === "pause") {
    await setState(ctx, "healer", "paused", "Paused by user override");
    return { skipped: true };
  }
  await setState(ctx, "healer", "working", "Scanning for failures");

  const fixes: string[] = [];

  // 1. Expire stale pending trades > 15 min old still 'pending'
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: stale } = await ctx.supabase
    .from("pending_trades")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  if (stale && stale.length > 0) {
    await ctx.supabase.from("pending_trades")
      .update({ status: "expired" })
      .in("id", stale.map((s: any) => s.id));
    fixes.push(`expired ${stale.length} stuck pending trades`);
    await ctx.supabase.from("agent_incidents").insert({
      user_id: ctx.userId,
      incident_type: "stuck_pending_trades",
      severity: "warning",
      description: `Expired ${stale.length} pending trades older than 15 min`,
      remediation: "auto-marked as expired",
      resolved: true,
      resolved_at: new Date().toISOString(),
    });
  }

  // 2. Check recent trader errors → if AI credit error, switch ai_settings to rule-based fallback flag
  const { data: recentTraderErr } = await ctx.supabase
    .from("agent_messages")
    .select("payload, created_at, subject")
    .eq("user_id", ctx.userId)
    .eq("from_agent", "trader")
    .eq("message_type", "agent_error")
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

  if (recentTraderErr && recentTraderErr.length >= 3) {
    fixes.push("3+ trader errors in 10m — flagged for review");
    await ctx.supabase.from("agent_incidents").insert({
      user_id: ctx.userId,
      incident_type: "repeated_trader_errors",
      severity: "error",
      description: `Trader reported ${recentTraderErr.length} errors in last 10 min`,
      context: { errors: recentTraderErr },
      remediation: "logged for user review",
    });
    await post(ctx, "healer", "all", "incident",
      `Trader is failing repeatedly (${recentTraderErr.length} errors in 10m) — review needed`,
      { count: recentTraderErr.length }, "critical");
  }

  // 3. Reset any agent stuck in 'working' for > 5 min
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: stuck } = await ctx.supabase
    .from("agent_state")
    .select("id, agent, last_heartbeat")
    .eq("user_id", ctx.userId)
    .eq("status", "working")
    .lt("last_heartbeat", stuckCutoff);
  if (stuck && stuck.length > 0) {
    for (const s of stuck as any[]) {
      await ctx.supabase.from("agent_state")
        .update({ status: "idle", current_task: "reset by healer (stuck)" })
        .eq("id", s.id);
      fixes.push(`reset stuck ${s.agent}`);
    }
  }

  const summary = { fixes, fixCount: fixes.length };
  if (fixes.length > 0) {
    await post(ctx, "healer", "all", "self_heal", `Applied ${fixes.length} fix(es): ${fixes.join("; ")}`, summary, "high");
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

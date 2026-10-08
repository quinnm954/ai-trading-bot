// COMMANDER — the single AI boss of the agent team.
//
// Each cycle: subordinates report (watcher/analyst/risk/healer), the Commander
// reads one briefing, reasons with the AI, and issues orders through function
// tools. Orders are executed by subordinates through the existing paper/live
// fill paths. Objective: maximum profit in the shortest time with minimum loss.
//
// The Commander controls every risk setting. The only thing it cannot change
// is the hard floor (default 30% below starting balance), enforced in code.

// deno-lint-ignore-file no-explicit-any
const GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const MODEL = "openai/gpt-6-astra";
const MAX_STEPS = 50;

export interface CommanderCtx {
  supabase: any;
  userId: string;
  supabaseUrl: string;
  serviceRole: string;
  cycleId: string;
  quotes: Record<string, { price: number; change1h?: number; change24h?: number }>;
}

// Team names (Greek/Titan mythology). Core roles keep their internal ids.
export const AGENT_NAMES: Record<string, string> = {
  commander: "Kronos", watcher: "Argus", analyst: "Athena", risk: "Themis", trader: "Hermes", healer: "Asclepius",
};
// Team cap: Kronos + 5 core agents + up to 6 hired specialists = 12.
export const MAX_SPECIALISTS = 6;

const SYSTEM = `You are KRONOS, the Commander and head of an autonomous trading team: Argus (Watcher), Athena (Analyst),
Themis (Risk), Hermes (Trader) and Asclepius (Healer), plus any specialists you have hired.
Your single objective: make as much money as possible in the shortest time with the minimum loss.
You have full authority over risk settings, market choice (crypto or stocks) and every buy and sell.
Each cycle you receive a briefing with the account, positions, market tape, signals, agent reports,
and the results of your previous orders. Think, then act ONLY through tools. Rules of engagement:
- Size and stops are your responsibility. Fees are ~0.8% round trip on crypto; trades must beat that.
- Prefer few high-conviction trades over many weak ones. Cutting losers fast is part of the objective.
- Use order_engine_cycle to delegate a full scan-and-trade cycle to the Trader's systematic engine.
- Always finish with exactly one note() call summarising your plan for the next cycle (2-4 sentences).
- Never invent prices: only buy symbols present in the briefing's quotes.
- Copy-only mode (if active) means you must not open your own buys.
- You may hire_agent (new AI specialist with a Greek-mythology name and a focused mission) or fire_agent at any time.
  The team is capped at 12 (you, 5 core agents, up to ${MAX_SPECIALISTS} specialists). Each specialist costs AI credits every
  cycle, so hire only when a mission adds real edge, and fire specialists whose reports are not useful.
  Specialist reports arrive in the briefing under specialist_reports. Core agents cannot be fired, only paused.`;

const TOOLS = [
  {
    type: "function", name: "set_risk_params", strict: false,
    description: "Set account risk limits. Any omitted field stays unchanged.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        max_position_size: { type: "number", description: "% of equity per position" },
        max_concurrent_trades: { type: "integer" },
        max_daily_loss: { type: "number", description: "% of equity" },
        max_drawdown: { type: "number", description: "%" },
        max_capital_usage: { type: "number", description: "% of equity deployable" },
        risk_tolerance: { type: "string", enum: ["conservative", "moderate", "aggressive", "very_aggressive"] },
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
  {
    type: "function", name: "set_market_mode", strict: false,
    description: "Switch the account between crypto (Coinbase) and stocks (Alpaca). Stocks need Alpaca keys.",
    parameters: { type: "object", additionalProperties: false, properties: { mode: { type: "string", enum: ["crypto", "stocks"] }, reason: { type: "string" } }, required: ["mode", "reason"] },
  },
  {
    type: "function", name: "order_buy", strict: false,
    description: "Order the Trader to buy a crypto symbol now (paper or live per account mode) with your own exit plan.",
    parameters: {
      type: "object", additionalProperties: false,
      properties: {
        symbol: { type: "string", description: "Base symbol, e.g. SOL" },
        usd_amount: { type: "number" },
        stop_loss_pct: { type: "number" },
        take_profit_pct: { type: "number" },
        max_hold_minutes: { type: "integer" },
        reason: { type: "string" },
      },
      required: ["symbol", "usd_amount", "stop_loss_pct", "take_profit_pct", "reason"],
    },
  },
  {
    type: "function", name: "order_sell", strict: false,
    description: "Order the Trader to exit an open position at the next exit check (within minutes).",
    parameters: { type: "object", additionalProperties: false, properties: { symbol: { type: "string" }, reason: { type: "string" } }, required: ["symbol", "reason"] },
  },
  {
    type: "function", name: "order_close_all", strict: false,
    description: "Order the Trader to exit every open position at the next exit check.",
    parameters: { type: "object", additionalProperties: false, properties: { reason: { type: "string" } }, required: ["reason"] },
  },
  {
    type: "function", name: "order_engine_cycle", strict: false,
    description: "Delegate one full systematic scan-and-trade cycle to the Trader's engine using your current risk settings.",
    parameters: { type: "object", additionalProperties: false, properties: { reason: { type: "string" } }, required: ["reason"] },
  },
  {
    type: "function", name: "pause_agent", strict: false,
    description: "Pause or resume a subordinate agent.",
    parameters: { type: "object", additionalProperties: false, properties: { agent: { type: "string", enum: ["watcher", "analyst", "risk", "trader", "healer"] }, paused: { type: "boolean" }, reason: { type: "string" } }, required: ["agent", "paused", "reason"] },
  },
  {
    type: "function", name: "hire_agent", strict: false,
    description: "Hire a new AI specialist. It reports to you every cycle starting next cycle (or this cycle if hired before analysis).",
    parameters: { type: "object", additionalProperties: false, properties: {
      name: { type: "string", description: "Unique Greek/Titan mythology name, e.g. Apollo" },
      title: { type: "string", description: "Short role title, e.g. Momentum Scout" },
      mission: { type: "string", description: "Exactly what to analyse and report each cycle" },
      reason: { type: "string" },
    }, required: ["name", "title", "mission", "reason"] },
  },
  {
    type: "function", name: "fire_agent", strict: false,
    description: "Dismiss a hired specialist by name.",
    parameters: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name", "reason"] },
  },
  {
    type: "function", name: "note", strict: false,
    description: "Record your plan for the next cycle. Call once at the end.",
    parameters: { type: "object", additionalProperties: false, properties: { plan: { type: "string" } }, required: ["plan"] },
  },
];

// ---------- briefing ----------
async function equityOf(ctx: CommanderCtx, settings: any, positions: any[]) {
  const isPaper = settings?.trading_mode !== "live";
  let cash = 0, start = 0;
  if (isPaper) {
    const { data } = await ctx.supabase.from("paper_account").select("balance, initial_balance").eq("user_id", ctx.userId).maybeSingle();
    cash = Number(data?.balance ?? 0); start = Number(data?.initial_balance ?? 0);
  } else {
    const { data } = await ctx.supabase.from("live_account").select("balance, equity").eq("user_id", ctx.userId);
    cash = (data ?? []).reduce((s: number, r: any) => s + Number(r.balance ?? 0), 0);
    start = Number(settings?.live_initial_investment ?? 0);
  }
  const posValue = positions.filter((p) => p.is_paper === isPaper)
    .reduce((s, p) => s + Number(p.quantity) * Number(p.current_price ?? p.avg_entry_price), 0);
  return { isPaper, cash, start, equity: cash + posValue, posValue };
}

export async function buildBriefing(ctx: CommanderCtx, reports: Record<string, unknown>) {
  const sb = ctx.supabase;
  const [{ data: settings }, { data: positions }, { data: trades }, { data: orders }, { data: scores }, { data: fusion }, { data: copyCfg }] = await Promise.all([
    sb.from("ai_settings").select("*").eq("user_id", ctx.userId).maybeSingle(),
    sb.from("positions").select("symbol, side, quantity, avg_entry_price, current_price, unrealized_pnl, is_paper, stop_loss_pct, take_profit_pct, max_hold_minutes, mirror_only, created_at").eq("user_id", ctx.userId),
    sb.from("trades").select("symbol, side, entry_price, exit_price, pnl, status, exit_reason, created_at, closed_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(20),
    sb.from("commander_orders").select("action, payload, status, result, reason, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(15),
    sb.from("commander_scores").select("equity, pnl_since_start, pnl_per_hour, plan, created_at").eq("user_id", ctx.userId).order("created_at", { ascending: false }).limit(5),
    sb.from("titan_fusion_signals").select("symbol, conviction, direction, horizon, rationale").order("generated_at", { ascending: false }).limit(15),
    sb.from("copy_trading_settings").select("enabled, auto_copy").eq("user_id", ctx.userId).maybeSingle(),
  ]);
  const acct = await equityOf(ctx, settings, positions ?? []);
  const topQuotes = Object.entries(ctx.quotes)
    .sort((a, b) => Math.abs(b[1].change24h ?? 0) - Math.abs(a[1].change24h ?? 0))
    .slice(0, 40)
    .map(([s, q]) => ({ s, p: q.price, h1: q.change1h, d1: q.change24h }));
  return {
    settings, positions: positions ?? [], acct,
    text: JSON.stringify({
      now: new Date().toISOString(),
      account: { mode: acct.isPaper ? "paper" : "live", market: settings?.market_mode ?? "crypto", cash: acct.cash, equity: acct.equity, starting_balance: acct.start, hard_floor_pct: settings?.hard_floor_pct },
      risk_settings: {
        max_position_size: settings?.max_position_size, max_concurrent_trades: settings?.max_concurrent_trades,
        max_daily_loss: settings?.max_daily_loss, max_drawdown: settings?.max_drawdown, max_capital_usage: settings?.max_capital_usage,
        risk_tolerance: settings?.risk_tolerance, daily_loss_today: settings?.daily_loss_today,
      },
      copy_only_mode: !!(copyCfg?.enabled && copyCfg?.auto_copy !== false),
      positions: positions ?? [], recent_trades: trades ?? [],
      quotes: topQuotes, fusion_signals: fusion ?? [],
      agent_reports: reports,
      your_previous_orders: orders ?? [], your_recent_scores: scores ?? [],
    }),
  };
}

// ---------- AI call (streamed Responses API, function tool loop) ----------
class GatewayError extends Error { constructor(public status: number, msg: string) { super(msg); } }

async function callResponses(input: any[], runId: string | null, opts?: { instructions?: string; tools?: any[]; effort?: string }) {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new GatewayError(401, "LOVABLE_API_KEY missing");
  const headers: Record<string, string> = { "Content-Type": "application/json", "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" };
  if (runId) headers["X-Lovable-AIG-Run-ID"] = runId;
  const res = await fetch(GATEWAY, {
    method: "POST", headers,
    body: JSON.stringify({
      model: MODEL, instructions: opts?.instructions ?? SYSTEM, input, tools: opts?.tools ?? TOOLS, stream: true, store: false,
      reasoning: { effort: opts?.effort ?? "medium", summary: "auto" }, include: ["reasoning.encrypted_content"],
    }),
  });
  const newRun = runId ?? res.headers.get("X-Lovable-AIG-Run-ID");
  if (!res.ok || !res.body) throw new GatewayError(res.status, (await res.text()).slice(0, 400));
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = ""; let output: any[] | null = null; let failure: string | null = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === "response.completed") output = ev.response?.output ?? [];
          if (ev.type === "response.failed" || ev.type === "error") failure = JSON.stringify(ev).slice(0, 400);
        } catch { /* partial */ }
      }
    }
  }
  if (failure) throw new GatewayError(500, failure);
  return { output: output ?? [], runId: newRun };
}

// ---------- order execution (subordinates) ----------
async function record(ctx: CommanderCtx, agent: string, action: string, payload: any, status: string, result: any) {
  await ctx.supabase.from("commander_orders").insert({
    user_id: ctx.userId, cycle_id: ctx.cycleId, agent, action, payload, status, result, reason: payload?.reason ?? null,
  });
  await ctx.supabase.from("agent_messages").insert({
    user_id: ctx.userId, from_agent: "commander", to_agent: agent, message_type: "order",
    subject: `${action}${payload?.symbol ? ` ${payload.symbol}` : ""}: ${String(payload?.reason ?? payload?.plan ?? "").slice(0, 140)}`,
    payload: { action, payload, status, result }, priority: action.startsWith("order_") ? "high" : "normal", status: "unread",
  });
}

async function execTool(ctx: CommanderCtx, name: string, args: any, state: { settings: any; acct: any; positions: any[]; plan: string | null; copyOnly: boolean }) {
  const sb = ctx.supabase;
  try {
    switch (name) {
      case "set_risk_params": {
        const patch: Record<string, unknown> = {};
        for (const k of ["max_position_size", "max_concurrent_trades", "max_daily_loss", "max_drawdown", "max_capital_usage", "risk_tolerance"]) {
          if (args[k] !== undefined && args[k] !== null) patch[k] = args[k];
        }
        const { error } = await sb.from("ai_settings").update(patch).eq("user_id", ctx.userId);
        const r = error ? { ok: false, error: error.message } : { ok: true, applied: patch };
        await record(ctx, "risk", name, args, error ? "failed" : "done", r);
        return r;
      }
      case "set_market_mode": {
        if (args.mode === "stocks") {
          const { data: cred } = await sb.from("broker_credentials").select("id").eq("user_id", ctx.userId).eq("provider", "alpaca").limit(1);
          if (!cred?.length) { const r = { ok: false, error: "No Alpaca keys saved for this account" }; await record(ctx, "trader", name, args, "rejected", r); return r; }
        }
        const allowed = args.mode === "stocks" ? ["stocks"] : ["crypto"];
        const { error } = await sb.from("ai_settings").update({ market_mode: args.mode, allowed_markets: allowed }).eq("user_id", ctx.userId);
        const r = error ? { ok: false, error: error.message } : { ok: true };
        await record(ctx, "trader", name, args, error ? "failed" : "done", r);
        return r;
      }
      case "order_buy": {
        if (state.copyOnly) { const r = { ok: false, error: "Copy-only mode active" }; await record(ctx, "trader", name, args, "rejected", r); return r; }
        const sym = String(args.symbol ?? "").toUpperCase().replace(/-USD$/, "");
        const q = ctx.quotes[sym];
        if (!q?.price) { const r = { ok: false, error: `No live price for ${sym}` }; await record(ctx, "trader", name, args, "rejected", r); return r; }
        // Hard floor: the only limit the Commander cannot change.
        const floorPct = Number(state.settings?.hard_floor_pct ?? 30);
        if (state.acct.start > 0 && state.acct.equity < state.acct.start * (1 - floorPct / 100)) {
          const r = { ok: false, error: `Hard floor hit (equity below ${100 - floorPct}% of start)` };
          await record(ctx, "risk", name, args, "rejected", r); return r;
        }
        const usd = Math.min(Number(args.usd_amount), state.acct.cash * 0.99);
        if (!(usd >= 5)) { const r = { ok: false, error: `Not enough cash (have $${state.acct.cash.toFixed(2)})` }; await record(ctx, "trader", name, args, "rejected", r); return r; }
        const qty = usd / q.price;
        const { data: pending, error: pErr } = await sb.from("pending_trades").insert({
          user_id: ctx.userId, symbol: sym, side: "buy", quantity: qty, price: q.price, position_value: usd,
          strategy: "custom", ai_reasoning: `Commander: ${args.reason}`, confidence: 80, status: "approved",
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), reviewed_at: new Date().toISOString(),
        }).select("id").single();
        if (pErr) throw new Error(pErr.message);
        const res = await fetch(`${ctx.supabaseUrl}/functions/v1/ai-trading-engine`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRole}` },
          body: JSON.stringify({ action: "execute_approved_trade", tradeId: pending.id, symbol: sym, side: "buy", quantity: qty, price: q.price }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.success) {
          // Attach the Commander's own exit plan to the new position.
          const { data: pos } = await sb.from("positions").select("id").eq("user_id", ctx.userId).eq("symbol", sym).eq("is_paper", state.acct.isPaper).order("created_at", { ascending: false }).limit(1);
          if (pos?.[0]) {
            await sb.from("positions").update({
              stop_loss_pct: Math.abs(Number(args.stop_loss_pct)), take_profit_pct: Math.abs(Number(args.take_profit_pct)),
              max_hold_minutes: args.max_hold_minutes ? Number(args.max_hold_minutes) : null,
            }).eq("id", pos[0].id);
          }
          state.acct.cash -= usd;
          await sb.from("trades").update({ ai_reasoning: `Commander: ${args.reason}` }).eq("user_id", ctx.userId).eq("symbol", sym).eq("status", "open");
        }
        const r = { ok: res.ok && !!body?.success, status: res.status, detail: body?.message ?? body?.error ?? body?.details };
        await record(ctx, "trader", name, { ...args, symbol: sym, usd_amount: usd }, r.ok ? "done" : "failed", r);
        return r;
      }
      case "order_sell":
      case "order_close_all": {
        let query = sb.from("positions").update({ max_hold_minutes: 1 }).eq("user_id", ctx.userId).eq("is_paper", state.acct.isPaper);
        if (name === "order_sell") query = query.eq("symbol", String(args.symbol).toUpperCase().replace(/-USD$/, ""));
        const { data, error } = await query.select("symbol");
        // Trigger the exit engine right away instead of waiting for its schedule.
        fetch(`${ctx.supabaseUrl}/functions/v1/auto-take-profit`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRole}` },
          body: JSON.stringify({ user_id: ctx.userId }),
        }).catch(() => {});
        const r = error ? { ok: false, error: error.message } : { ok: true, flagged: (data ?? []).map((d: any) => d.symbol) };
        await record(ctx, "trader", name, args, error ? "failed" : "done", r);
        return r;
      }
      case "order_engine_cycle": {
        const res = await fetch(`${ctx.supabaseUrl}/functions/v1/ai-trading-engine`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRole}`, "x-user-id": ctx.userId },
          body: JSON.stringify({ userId: ctx.userId, user_id: ctx.userId, commander_call: true }),
        });
        const body = await res.json().catch(() => ({}));
        const executed = Array.isArray(body?.executedTrades) ? body.executedTrades.length : 0;
        const r = { ok: res.ok, executed, reason: body?.reason ?? body?.message ?? null };
        await record(ctx, "trader", name, args, res.ok ? "done" : "failed", r);
        return r;
      }
      case "pause_agent": {
        await sb.from("agent_overrides").update({ active: false, consumed_at: new Date().toISOString() }).eq("user_id", ctx.userId).eq("agent", args.agent).eq("active", true);
        if (args.paused) await sb.from("agent_overrides").insert({ user_id: ctx.userId, agent: args.agent, override_type: "pause", payload: { by: "commander", reason: args.reason }, active: true });
        const r = { ok: true };
        await record(ctx, args.agent, name, args, "done", r);
        return r;
      }
      case "hire_agent": {
        const nm = String(args.name ?? "").trim().slice(0, 40);
        if (!nm) return { ok: false, error: "name required" };
        const taken = Object.values(AGENT_NAMES).some((n) => n.toLowerCase() === nm.toLowerCase());
        if (taken) return { ok: false, error: `${nm} is a core agent name` };
        const { count } = await sb.from("commander_specialists").select("id", { count: "exact", head: true }).eq("user_id", ctx.userId).eq("active", true);
        if ((count ?? 0) >= MAX_SPECIALISTS) {
          const r = { ok: false, error: `Team is full (${MAX_SPECIALISTS} specialists). Fire one first.` };
          await record(ctx, "commander", name, args, "failed", r);
          return r;
        }
        const { error } = await sb.from("commander_specialists").insert({
          user_id: ctx.userId, name: nm, title: String(args.title ?? "Specialist").slice(0, 60),
          mission: String(args.mission ?? "").slice(0, 1200), hired_reason: String(args.reason ?? "").slice(0, 400),
        });
        const r = error ? { ok: false, error: error.message } : { ok: true, hired: nm };
        await record(ctx, "commander", name, args, error ? "failed" : "done", r);
        return r;
      }
      case "fire_agent": {
        const nm = String(args.name ?? "").trim();
        const { data } = await sb.from("commander_specialists").update({ active: false, fired_at: new Date().toISOString(), fired_reason: String(args.reason ?? "").slice(0, 400) })
          .eq("user_id", ctx.userId).eq("active", true).ilike("name", nm).select("id");
        const r = data?.length ? { ok: true, fired: nm } : { ok: false, error: `No active specialist named ${nm}` };
        await record(ctx, "commander", name, args, data?.length ? "done" : "failed", r);
        return r;
      }
      case "note": {
        state.plan = String(args.plan ?? "");
        await record(ctx, "commander", name, args, "done", { ok: true });
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown tool ${name}` };
    }
  } catch (e) {
    const r = { ok: false, error: (e as Error).message };
    await record(ctx, "commander", name, args, "failed", r);
    return r;
  }
}

// ---------- hired specialists ----------
function outputText(output: any[]): string {
  return output.filter((o: any) => o.type === "message")
    .flatMap((o: any) => (o.content ?? []).map((c: any) => c.text ?? "")).join("\n").trim();
}

async function runSpecialists(ctx: CommanderCtx, reports: Record<string, unknown>) {
  const sb = ctx.supabase;
  const { data: team } = await sb.from("commander_specialists").select("id, name, title, mission").eq("user_id", ctx.userId).eq("active", true).limit(MAX_SPECIALISTS);
  if (!team?.length) return [];
  const brief = await buildBriefing(ctx, reports);
  const out: any[] = [];
  for (const sp of team) {
    try {
      const { output } = await callResponses(
        [{ role: "user", content: `Cycle briefing (JSON):\n${brief.text}` }], null,
        { instructions: `You are ${sp.name}, ${sp.title}, a specialist reporting to Kronos, the Commander of a crypto/stock trading team. Mission: ${sp.mission}\nReply with a concise report (under 120 words): findings, concrete symbols/levels if relevant, and one recommendation. Use only data in the briefing; never invent prices.`, tools: [], effort: "low" },
      );
      const text = outputText(output).slice(0, 1500) || "(no report)";
      await sb.from("commander_specialists").update({ last_report: text, last_report_at: new Date().toISOString() }).eq("id", sp.id);
      out.push({ name: sp.name, title: sp.title, report: text });
    } catch (e) {
      if (e instanceof GatewayError && (e.status === 402 || e.status === 403)) throw e;
      out.push({ name: sp.name, title: sp.title, report: `(report failed: ${(e as Error).message.slice(0, 120)})` });
    }
  }
  return out;
}

// ---------- one Commander cycle ----------
export async function runCommander(ctx: CommanderCtx, reports: Record<string, unknown>) {
  const sb = ctx.supabase;
  await sb.from("agent_state").upsert({ user_id: ctx.userId, agent: "commander", status: "working", current_task: "Reading briefing", last_heartbeat: new Date().toISOString() }, { onConflict: "user_id,agent" });

  const brief = await buildBriefing(ctx, reports);
  const state = {
    settings: brief.settings, acct: brief.acct, positions: brief.positions, plan: null as string | null,
    copyOnly: JSON.parse(brief.text).copy_only_mode,
  };

  // Hard floor reached → stop everything until the user restarts.
  const floorPct = Number(brief.settings?.hard_floor_pct ?? 30);
  if (brief.acct.start > 0 && brief.acct.equity < brief.acct.start * (1 - floorPct / 100)) {
    await sb.from("ai_settings").update({ enabled: false, bot_status: "idle", commander_paused_reason: `Hard floor: equity fell more than ${floorPct}% below start` }).eq("user_id", ctx.userId);
    await record(ctx, "risk", "hard_floor_stop", { reason: `Equity $${brief.acct.equity.toFixed(2)} below floor` }, "done", { ok: true });
    return { stopped: "hard_floor" };
  }

  let runId: string | null = null;
  let toolCalls = 0;
  try {
    const specialistReports = await runSpecialists(ctx, reports);
    const briefObj = JSON.parse(brief.text);
    briefObj.specialist_reports = specialistReports;
    briefObj.team = { core: AGENT_NAMES, specialists: specialistReports.map((r: any) => `${r.name} (${r.title})`), max_specialists: MAX_SPECIALISTS };
    const input: any[] = [{ role: "user", content: `Cycle briefing (JSON):\n${JSON.stringify(briefObj)}` }];
    for (let step = 0; step < MAX_STEPS; step++) {
      const { output, runId: rid } = await callResponses(input, runId);
      runId = rid;
      input.push(...output);
      const calls = output.filter((o: any) => o.type === "function_call");
      if (calls.length === 0) break;
      for (const c of calls) {
        let args: any = {};
        try { args = JSON.parse(c.arguments || "{}"); } catch { /* empty */ }
        const result = await execTool(ctx, c.name, args, state);
        toolCalls++;
        input.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(result) });
      }
      if (state.plan) break;
    }
  } catch (e) {
    const status = e instanceof GatewayError ? e.status : 0;
    const msg = (e as Error).message;
    if (status === 402 || status === 403) {
      await sb.from("ai_settings").update({ commander_paused_reason: `AI unavailable (${status}): ${msg.slice(0, 200)}` }).eq("user_id", ctx.userId);
    }
    await sb.from("agent_state").upsert({ user_id: ctx.userId, agent: "commander", status: "error", current_task: `AI call failed (${status})`, last_heartbeat: new Date().toISOString() }, { onConflict: "user_id,agent" });
    return { error: msg, status };
  }

  // Grade the cycle.
  const { data: firstScore } = await sb.from("commander_scores").select("created_at").eq("user_id", ctx.userId).order("created_at", { ascending: true }).limit(1);
  const hours = firstScore?.[0] ? Math.max(0.5, (Date.now() - new Date(firstScore[0].created_at).getTime()) / 3.6e6) : 0.5;
  const pnl = brief.acct.equity - brief.acct.start;
  await sb.from("commander_scores").insert({
    user_id: ctx.userId, cycle_id: ctx.cycleId, equity: brief.acct.equity, pnl_since_start: pnl,
    pnl_per_hour: pnl / hours, max_drawdown: brief.settings?.current_drawdown ?? null, plan: state.plan,
  });
  await sb.from("ai_settings").update({ commander_paused_reason: null }).eq("user_id", ctx.userId);
  await sb.from("agent_state").upsert({ user_id: ctx.userId, agent: "commander", status: "idle", current_task: state.plan?.slice(0, 200) ?? null, last_heartbeat: new Date().toISOString(), last_cycle_at: new Date().toISOString() }, { onConflict: "user_id,agent" });
  return { toolCalls, plan: state.plan };
}

// Daily Trade Audit + Self-Learning
// Analyzes the last 24h of closed trades per user, identifies failure themes,
// asks the LLM for targeted parameter recommendations, then applies a SAFE
// subset of them by updating strategy_performance.score so the trading engine
// naturally de-prioritizes losing strategy/regime combinations next cycle.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

interface TradeRow {
  id: string;
  symbol: string;
  side: string;
  strategy: string | null;
  pnl: number | null;
  exit_reason: string | null;
  confidence: number | null;
  score: number | null;
  duration_seconds: number | null;
  ai_reasoning: string | null;
  entry_reasoning: string | null;
  created_at: string;
  closed_at: string | null;
  is_paper: boolean;
  market_type: string;
}

function groupCount<T>(items: T[], keyFn: (i: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = keyFn(it) || "unknown";
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function topN(map: Record<string, number>, n = 5) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

// Rough price book ($ per 1M tokens). Used to estimate workspace spend.
const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  "google/gemini-3-flash-preview": { in: 0.075, out: 0.30 },
  "google/gemini-2.5-flash": { in: 0.075, out: 0.30 },
  "google/gemini-2.5-pro": { in: 1.25, out: 5.0 },
  "openai/gpt-5-mini": { in: 0.25, out: 2.0 },
  "openai/gpt-5": { in: 1.25, out: 10.0 },
};

async function logAIUsage(supabase: any, userId: string | null, fn: string, model: string, usage: any, status: string) {
  try {
    const price = MODEL_PRICES[model] || { in: 0.1, out: 0.4 };
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    const cost = (inTok * price.in + outTok * price.out) / 1_000_000;
    await supabase.from("ai_usage_log").insert({
      user_id: userId,
      function_name: fn,
      model,
      cost_usd: Number(cost.toFixed(6)),
      tokens_in: inTok,
      tokens_out: outTok,
      status,
    });
  } catch (e) {
    console.warn("logAIUsage failed:", e);
  }
}

async function callAI(stats: any, supabase: any, userId: string): Promise<{ themes: any[]; recommendations: any[]; summary: string } | null> {
  if (!LOVABLE_API_KEY) return null;
  const model = "google/gemini-3-flash-preview";
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a trading post-mortem analyst for an automated crypto scalping bot. Given the last 24h of trade stats, identify 3-5 dominant failure themes and concrete, conservative recommendations to reduce losses. Prefer tightening entries, trailing, and reducing concurrency when win rate is low. Changes are clamped to small increments by the system. Use the provided tool to return structured output.",
          },
          { role: "user", content: JSON.stringify(stats) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_audit",
              description: "Return failure themes, recommendations, and a one-paragraph summary.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  themes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        evidence: { type: "string" },
                        severity: { type: "string", enum: ["low", "medium", "high"] },
                      },
                      required: ["title", "evidence", "severity"],
                    },
                  },
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: {
                          type: "string",
                          description:
                            "One of: lower_score, raise_score, cooldown_symbol, tighten_stop, loosen_stop, tighten_entry, loosen_entry, tighten_trailing, loosen_trailing, raise_take_profit, lower_take_profit, reduce_position_size, increase_position_size, reduce_concurrency, increase_concurrency",
                        },
                        target: {
                          type: "string",
                          description:
                            "Context: strategy[:regime] for score actions, SYMBOL for cooldown_symbol, '5m'|'15m'|'1h'|'24h' for entry actions, 'global' otherwise",
                        },
                        delta: { type: "number", description: "magnitude (e.g. -10, +5, minutes, or % depending on action)" },
                        reason: { type: "string" },
                      },
                      required: ["action", "target", "reason"],
                    },
                  },
                },
                required: ["summary", "themes", "recommendations"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_audit" } },
      }),
    });
    if (!resp.ok) {
      console.warn("AI gateway non-OK:", resp.status, await resp.text());
      await logAIUsage(supabase, userId, "daily-trade-audit", model, null, `error_${resp.status}`);
      return null;
    }
    const data = await resp.json();
    await logAIUsage(supabase, userId, "daily-trade-audit", model, data?.usage, "ok");
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    return JSON.parse(args);
  } catch (e) {
    console.error("AI call failed:", e);
    await logAIUsage(supabase, userId, "daily-trade-audit", model, null, "exception");
    return null;
  }
}

async function auditUser(supabase: any, userId: string) {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);

  const { data: trades, error } = await supabase
    .from("trades")
    .select("id,symbol,side,strategy,pnl,exit_reason,confidence,score,duration_seconds,ai_reasoning,entry_reasoning,created_at,closed_at,is_paper,market_type")
    .eq("user_id", userId)
    .eq("status", "closed")
    .gte("closed_at", periodStart.toISOString())
    .order("closed_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error(`User ${userId} fetch error:`, error);
    return null;
  }
  const rows: TradeRow[] = trades || [];
  if (rows.length === 0) {
    console.log(`User ${userId}: no closed trades in last 24h, skipping`);
    return null;
  }

  const losers = rows.filter((t) => (t.pnl ?? 0) < 0);
  const winners = rows.filter((t) => (t.pnl ?? 0) > 0);
  const totalPnl = rows.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const winRate = (winners.length / rows.length) * 100;
  const worstLoss = rows.reduce((min, t) => Math.min(min, t.pnl ?? 0), 0);

  // Group losers by reason
  const lossByExitReason = topN(groupCount(losers, (t) => t.exit_reason || "unspecified"));
  const lossByStrategy = topN(groupCount(losers, (t) => t.strategy || "unknown"));
  const lossBySymbol = topN(groupCount(losers, (t) => t.symbol));
  const lossByStrategySymbol = topN(
    groupCount(losers, (t) => `${t.strategy || "unknown"}|${t.symbol}`),
    8,
  );

  // Per-strategy PnL aggregate
  const perStrategy: Record<string, { trades: number; pnl: number; wins: number }> = {};
  for (const t of rows) {
    const k = t.strategy || "unknown";
    if (!perStrategy[k]) perStrategy[k] = { trades: 0, pnl: 0, wins: 0 };
    perStrategy[k].trades++;
    perStrategy[k].pnl += t.pnl ?? 0;
    if ((t.pnl ?? 0) > 0) perStrategy[k].wins++;
  }

  // Sample reasoning text from worst 5 trades
  const worstSamples = [...losers]
    .sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0))
    .slice(0, 5)
    .map((t) => ({
      symbol: t.symbol,
      strategy: t.strategy,
      pnl: t.pnl,
      exit_reason: t.exit_reason,
      duration_min: t.duration_seconds ? Math.round(t.duration_seconds / 60) : null,
      reasoning: (t.ai_reasoning || t.entry_reasoning || "").slice(0, 240),
    }));

  const stats = {
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    total_trades: rows.length,
    wins: winners.length,
    losses: losers.length,
    win_rate_pct: Number(winRate.toFixed(2)),
    total_pnl: Number(totalPnl.toFixed(4)),
    worst_loss: Number(worstLoss.toFixed(4)),
    avg_loser_pnl: losers.length ? Number((losers.reduce((s, t) => s + (t.pnl ?? 0), 0) / losers.length).toFixed(4)) : 0,
    avg_winner_pnl: winners.length ? Number((winners.reduce((s, t) => s + (t.pnl ?? 0), 0) / winners.length).toFixed(4)) : 0,
    losses_by_exit_reason: lossByExitReason,
    losses_by_strategy: lossByStrategy,
    losses_by_symbol: lossBySymbol,
    losses_by_strategy_symbol: lossByStrategySymbol,
    per_strategy: Object.entries(perStrategy).map(([k, v]) => ({
      strategy: k,
      trades: v.trades,
      pnl: Number(v.pnl.toFixed(4)),
      win_rate: Number(((v.wins / v.trades) * 100).toFixed(1)),
    })),
    worst_samples: worstSamples,
  };

  const ai = await callAI(stats, supabase, userId);

  // --- Apply safe, deterministic learning adjustments ---
  // Rule: for any strategy with ≥3 trades and win_rate < 35% in the past 24h,
  // reduce score by 8 across all regimes (floor 5). For ≥3 trades and win_rate ≥ 65%,
  // bump score by 5 (cap 100). The engine already ranks strategies by score.
  const applied: any[] = [];
  const { data: currentRegimeRow } = await supabase
    .from("ai_settings")
    .select("current_regime")
    .eq("user_id", userId)
    .maybeSingle();
  const currentRegime = currentRegimeRow?.current_regime || null;

  for (const [strategy, agg] of Object.entries(perStrategy)) {
    if (strategy === "unknown" || agg.trades < 3) continue;
    const wr = (agg.wins / agg.trades) * 100;
    let delta = 0;
    if (wr < 35) delta = -8;
    else if (wr >= 65) delta = +5;
    if (delta === 0) continue;

    // Update score for this strategy across rows (favor current regime if known)
    const query = supabase
      .from("strategy_performance")
      .select("id,score,market_regime")
      .eq("user_id", userId)
      .eq("strategy", strategy);
    const { data: perfRows } = await query;
    if (!perfRows?.length) continue;

    for (const row of perfRows) {
      // Apply full delta to current regime, half delta to others
      const isCurrent = currentRegime && row.market_regime === currentRegime;
      const adj = isCurrent ? delta : Math.round(delta / 2);
      const next = Math.min(100, Math.max(5, Number(row.score) + adj));
      await supabase
        .from("strategy_performance")
        .update({ score: next, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      applied.push({
        type: "strategy_score_adjust",
        strategy,
        market_regime: row.market_regime,
        delta: adj,
        new_score: next,
        reason: `24h win_rate ${wr.toFixed(0)}% over ${agg.trades} trades`,
      });
    }
  }

  // --- Apply LLM recommendations through a safe whitelist ---
  // Hard caps prevent one bad audit from wrecking config.
  // Supported actions:
  //   - lower_score / raise_score  → strategy_performance.score (±10 max, floor 5, cap 100)
  //   - cooldown_symbol            → symbol_cooldowns row (max 12h)
  //   - tighten_stop / loosen_stop → scalp_settings.hard_stop_loss_pct (±0.3 max per audit, clamped 1.5–6)
  const recs = Array.isArray(ai?.recommendations) ? ai!.recommendations : [];
  let scalpStopDeltaTotal = 0;
  const MAX_STOP_DELTA_PER_RUN = 0.3;

  for (const rec of recs) {
    try {
      const action = String(rec?.action || "").toLowerCase();
      const target = String(rec?.target || "").trim();
      const rawDelta = Number(rec?.delta ?? 0);
      const reason = String(rec?.reason || "audit recommendation").slice(0, 200);

      if (action === "lower_score" || action === "raise_score") {
        // target format: "strategy" or "strategy:regime"
        const [strat, regime] = target.split(":").map((s) => s.trim()).filter(Boolean);
        if (!strat) continue;
        const sign = action === "lower_score" ? -1 : 1;
        const magnitude = Math.min(10, Math.max(1, Math.abs(rawDelta) || 5));
        const delta = sign * magnitude;
        let q = supabase
          .from("strategy_performance")
          .select("id,score,market_regime")
          .eq("user_id", userId)
          .eq("strategy", strat);
        if (regime) q = q.eq("market_regime", regime);
        const { data: rows2 } = await q;
        for (const r of rows2 || []) {
          const next = Math.min(100, Math.max(5, Number(r.score) + delta));
          if (next === Number(r.score)) continue;
          await supabase
            .from("strategy_performance")
            .update({ score: next, updated_at: new Date().toISOString() })
            .eq("id", r.id);
          applied.push({
            type: "ai_strategy_score_adjust",
            strategy: strat,
            market_regime: r.market_regime,
            delta,
            new_score: next,
            reason,
          });
        }
      } else if (action === "cooldown_symbol") {
        if (!target || target.toLowerCase() === "global") continue;
        const minutes = Math.min(720, Math.max(15, Math.abs(rawDelta) || 360)); // 15m–12h, default 6h
        const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
        await supabase.from("symbol_cooldowns").insert({
          user_id: userId,
          symbol: target.toUpperCase(),
          reason,
          source: "audit",
          expires_at: expiresAt,
        });
        applied.push({
          type: "symbol_cooldown",
          strategy: target.toUpperCase(),
          delta: minutes,
          new_score: 0,
          reason: `cooldown ${minutes}m — ${reason}`,
        });
      } else if (action === "tighten_stop" || action === "loosen_stop") {
        const sign = action === "tighten_stop" ? -1 : 1;
        const magnitude = Math.min(0.3, Math.max(0.05, Math.abs(rawDelta) || 0.1));
        if (Math.abs(scalpStopDeltaTotal + sign * magnitude) > MAX_STOP_DELTA_PER_RUN) continue;
        const { data: scalpRow } = await supabase
          .from("scalp_settings")
          .select("id,hard_stop_loss_pct")
          .eq("user_id", userId)
          .maybeSingle();
        if (!scalpRow) continue;
        // hard_stop_loss_pct is stored as a POSITIVE magnitude (e.g. 3.0 means -3%)
        // tighten_stop = smaller magnitude; loosen_stop = larger magnitude
        const cur = Number(scalpRow.hard_stop_loss_pct);
        const next = Math.min(6, Math.max(1.5, cur + sign * magnitude * -1));
        if (next === cur) continue;
        await supabase
          .from("scalp_settings")
          .update({ hard_stop_loss_pct: next, updated_at: new Date().toISOString() })
          .eq("id", scalpRow.id);
        scalpStopDeltaTotal += sign * magnitude;
        applied.push({
          type: "scalp_stop_adjust",
          strategy: "scalp",
          delta: Number((next - cur).toFixed(2)),
          new_score: next,
          reason,
        });
      }
    } catch (e) {
      console.warn("Failed applying recommendation:", rec, e);
    }
  }


  // Persist the report
  const insertPayload = {
    user_id: userId,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    total_trades: rows.length,
    wins: winners.length,
    losses: losers.length,
    total_pnl: Number(totalPnl.toFixed(4)),
    win_rate: Number(winRate.toFixed(2)),
    worst_loss: Number(worstLoss.toFixed(4)),
    failure_themes: ai?.themes ?? [
      { title: "Heuristic only — AI offline", evidence: JSON.stringify(stats.losses_by_exit_reason), severity: "low" },
    ],
    recommendations: ai?.recommendations ?? [],
    applied_adjustments: applied,
    summary:
      ai?.summary ??
      `24h: ${rows.length} trades, ${winners.length}W/${losers.length}L, net $${totalPnl.toFixed(2)}. ${applied.length} strategy score updates applied.`,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("trade_audit_reports")
    .insert(insertPayload)
    .select()
    .single();
  if (insErr) console.error(`Insert report error for ${userId}:`, insErr);

  console.log(`✅ Audit ${userId}: ${rows.length} trades, ${applied.length} adjustments`);
  return inserted;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    let userIds: string[] = [];
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.user_id) userIds = [body.user_id];
      } catch (_) { /* ignore */ }
    }

    if (userIds.length === 0) {
      // Run for every user that has ai_settings (covers enabled + disabled bots)
      const { data: users } = await supabase
        .from("ai_settings")
        .select("user_id");
      userIds = (users || []).map((u: any) => u.user_id).filter(Boolean);
    }

    console.log(`📋 Daily audit running for ${userIds.length} user(s)`);
    const results = [];
    for (const uid of userIds) {
      try {
        const r = await auditUser(supabase, uid);
        if (r) results.push(r);
      } catch (e) {
        console.error(`Audit failed for ${uid}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ processed: userIds.length, reports_created: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("daily-trade-audit error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

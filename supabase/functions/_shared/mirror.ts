// Leader mirroring: the admin (owner) account is the only decision-maker.
// Every other account copies the leader's open positions at the same % of
// equity and closes them when the leader closes. Pull-based so every leader
// buy/sell path (Commander, engine, exit engine) is covered.
// deno-lint-ignore-file no-explicit-any

const MAX_ENTRY_AGE_MIN = 15;     // only copy fresh leader entries
const MAX_PRICE_DRIFT_PCT = 0.5;  // skip if price moved >0.5% from leader fill
const MIN_USD = 5;

export async function getLeaderId(sb: any): Promise<string | null> {
  const { data } = await sb.from("user_roles").select("user_id, created_at").eq("role", "admin").order("created_at", { ascending: true }).limit(1);
  return data?.[0]?.user_id ?? null;
}

async function equityOf(sb: any, userId: string, isPaper: boolean) {
  const { data: pos } = await sb.from("positions").select("quantity, current_price, avg_entry_price").eq("user_id", userId).eq("is_paper", isPaper);
  const posVal = (pos ?? []).reduce((s: number, p: any) => s + Number(p.quantity) * Number(p.current_price ?? p.avg_entry_price ?? 0), 0);
  if (isPaper) {
    const { data: pa } = await sb.from("paper_account").select("balance, initial_balance").eq("user_id", userId).maybeSingle();
    const cash = Number(pa?.balance ?? 0);
    return { cash, equity: cash + posVal, start: Number(pa?.initial_balance ?? 0) };
  }
  const { data: la } = await sb.from("live_account").select("balance, equity").eq("user_id", userId).maybeSingle();
  const cash = Number(la?.balance ?? 0);
  return { cash, equity: Number(la?.equity ?? cash + posVal), start: 0 };
}

export async function runMirror(opts: {
  sb: any; userId: string; leaderId: string; supabaseUrl: string; serviceRole: string;
  quotes: Record<string, { price: number }>;
}) {
  const { sb, userId, leaderId, quotes } = opts;
  const out: any = { opened: [], closed: [], skipped: [] };
  const { data: fs } = await sb.from("ai_settings").select("trading_mode, kill_switch_active, hard_floor_pct").eq("user_id", userId).maybeSingle();
  const isPaper = fs?.trading_mode !== "live";

  // 1) Exits: close any mirrored position whose leader position is gone.
  const { data: mine } = await sb.from("positions").select("id, symbol, mirror_of, max_hold_minutes").eq("user_id", userId).eq("is_paper", isPaper);
  const { data: lead } = await sb.from("positions").select("id, symbol, quantity, avg_entry_price, stop_loss_pct, take_profit_pct, max_hold_minutes, created_at").eq("user_id", leaderId).eq("is_paper", isPaper);
  const leadIds = new Set((lead ?? []).map((p: any) => p.id));
  for (const p of mine ?? []) {
    if (p.mirror_of && !leadIds.has(p.mirror_of) && p.max_hold_minutes !== 1) {
      await sb.from("positions").update({ max_hold_minutes: 1 }).eq("id", p.id);
      out.closed.push(p.symbol);
    }
  }

  // 2) Entries.
  if (fs?.kill_switch_active) return { ...out, note: "kill switch" };
  const me = await equityOf(sb, userId, isPaper);
  const floorPct = Number(fs?.hard_floor_pct ?? 30);
  if (me.start > 0 && me.equity < me.start * (1 - floorPct / 100)) return { ...out, note: "hard floor" };
  const held = new Set((mine ?? []).map((p: any) => p.symbol));
  const mirrored = new Set((mine ?? []).map((p: any) => p.mirror_of).filter(Boolean));
  const leader = await equityOf(sb, leaderId, isPaper);
  if (!(leader.equity > 0)) return out;
  let cash = me.cash;

  for (const lp of lead ?? []) {
    if (mirrored.has(lp.id) || held.has(lp.symbol)) continue;
    if (Date.now() - new Date(lp.created_at).getTime() > MAX_ENTRY_AGE_MIN * 60_000) continue;
    const sym = String(lp.symbol).toUpperCase().replace(/-USD$/, "");
    const price = Number(quotes[sym]?.price);
    const entry = Number(lp.avg_entry_price);
    if (!(price > 0)) { out.skipped.push(`${sym}: no price`); continue; }
    if (Math.abs(price - entry) / entry * 100 > MAX_PRICE_DRIFT_PCT) { out.skipped.push(`${sym}: price moved`); continue; }
    const share = (Number(lp.quantity) * entry) / leader.equity;
    const usd = Math.min(share * me.equity, cash * 0.99);
    if (!(usd >= MIN_USD)) { out.skipped.push(`${sym}: cash`); continue; }

    const { data: lt } = await sb.from("trades").select("ai_reasoning, entry_reasoning, strategy").eq("user_id", leaderId).eq("symbol", lp.symbol).eq("status", "open").order("created_at", { ascending: false }).limit(1);
    const reasoning = lt?.[0]?.ai_reasoning ?? lt?.[0]?.entry_reasoning ?? "Commander entry";
    const qty = usd / price;
    const { data: pending, error } = await sb.from("pending_trades").insert({
      user_id: userId, symbol: sym, side: "buy", quantity: qty, price, position_value: usd,
      strategy: "custom", ai_reasoning: reasoning, confidence: 80, status: "approved",
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), reviewed_at: new Date().toISOString(),
    }).select("id").single();
    if (error) { out.skipped.push(`${sym}: ${error.message}`); continue; }
    const res = await fetch(`${opts.supabaseUrl}/functions/v1/ai-trading-engine`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.serviceRole}` },
      body: JSON.stringify({ action: "execute_approved_trade", tradeId: pending.id, symbol: sym, side: "buy", quantity: qty, price }),
    });
    const body = await res.json().catch(() => ({}));
    if (!(res.ok && body?.success)) { out.skipped.push(`${sym}: ${body?.message ?? body?.error ?? res.status}`); continue; }
    const { data: np } = await sb.from("positions").select("id").eq("user_id", userId).eq("symbol", lp.symbol).eq("is_paper", isPaper).order("created_at", { ascending: false }).limit(1);
    if (np?.[0]) {
      await sb.from("positions").update({
        mirror_of: lp.id, stop_loss_pct: lp.stop_loss_pct, take_profit_pct: lp.take_profit_pct, max_hold_minutes: lp.max_hold_minutes,
      }).eq("id", np[0].id);
    }
    cash -= usd;
    out.opened.push({ symbol: sym, usd: Math.round(usd * 100) / 100, reasoning });
  }
  return out;
}

import { useCallback, useEffect, useState } from "react";
import { Crown, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface OrderRow { id: string; agent: string; action: string; status: string; reason: string | null; payload: Record<string, unknown>; created_at: string }
interface ScoreRow { equity: number; pnl_since_start: number; pnl_per_hour: number | null; plan: string | null; created_at: string }

const ACTION_LABEL: Record<string, string> = {
  set_risk_params: "Set risk limits",
  set_market_mode: "Switched market",
  order_buy: "Buy",
  order_sell: "Sell",
  order_close_all: "Close everything",
  order_engine_cycle: "Ran trading scan",
  pause_agent: "Paused/resumed agent",
  note: "Plan",
  hard_floor_stop: "Emergency floor stop",
};

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function CommanderPanel() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [score, setScore] = useState<ScoreRow | null>(null);
  const [paused, setPaused] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [o, s, a] = await Promise.all([
      supabase.from("commander_orders").select("id, agent, action, status, reason, payload, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
      supabase.from("commander_scores").select("equity, pnl_since_start, pnl_per_hour, plan, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("ai_settings").select("commander_paused_reason").eq("user_id", user.id).maybeSingle(),
    ]);
    setOrders((o.data ?? []) as OrderRow[]);
    setScore(((s.data ?? [])[0] as ScoreRow) ?? null);
    setPaused(a.data?.commander_paused_reason ?? null);
  }, [user]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Card className="p-5 space-y-4 border-primary/40">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/15"><Crown className="w-5 h-5 text-primary" /></div>
          <div>
            <h2 className="text-lg font-semibold">Commander</h2>
            <p className="text-xs text-muted-foreground">Head agent. Gives orders to Watcher, Analyst, Risk, Trader and Healer every cycle.</p>
          </div>
        </div>
        {score && (
          <div className="flex gap-4 text-sm">
            <div><div className="text-xs text-muted-foreground">Profit since start</div><div className={score.pnl_since_start >= 0 ? "text-profit font-semibold" : "text-loss font-semibold"}>{usd(Number(score.pnl_since_start))}</div></div>
            <div><div className="text-xs text-muted-foreground">Per hour</div><div className="font-semibold">{usd(Number(score.pnl_per_hour ?? 0))}</div></div>
          </div>
        )}
      </div>

      {paused && (
        <div className="flex items-center gap-2 text-sm text-loss"><ShieldAlert className="w-4 h-4" />{paused}</div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Current plan</div>
        <p className="text-sm">{score?.plan ?? "No plan yet. The Commander writes one after its first cycle."}</p>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Latest orders</div>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="space-y-2">
            {orders.filter((o) => o.action !== "note").map((o) => (
              <li key={o.id} className="text-sm flex gap-2 items-start">
                <Badge variant={o.status === "done" ? "default" : o.status === "rejected" || o.status === "failed" ? "destructive" : "secondary"} className="shrink-0 capitalize">{o.agent}</Badge>
                <div className="min-w-0">
                  <span className="font-medium">{ACTION_LABEL[o.action] ?? o.action}{typeof o.payload?.symbol === "string" ? ` ${o.payload.symbol}` : ""}</span>
                  <span className="text-muted-foreground"> · {formatDistanceToNow(new Date(o.created_at), { addSuffix: true })}</span>
                  {o.reason && <p className="text-xs text-muted-foreground line-clamp-2">{o.reason}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

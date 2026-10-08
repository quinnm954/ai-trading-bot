import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const CORE = [
  { id: "watcher", name: "Argus", title: "Watcher" },
  { id: "analyst", name: "Athena", title: "Analyst" },
  { id: "risk", name: "Themis", title: "Risk" },
  { id: "trader", name: "Hermes", title: "Trader" },
  { id: "healer", name: "Asclepius", title: "Healer" },
] as const;

export type AgentStatus = "working" | "idle" | "paused" | "error";
export interface WarAgent { id: string; name: string; title: string; status: AgentStatus; task: string | null; report: string | null; specialist: boolean }
export interface WarOrder { id: string; agent: string; action: string; payload: Record<string, unknown>; reason: string | null; created_at: string }

export function useWarRoomData() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<WarAgent[]>([]);
  const [commander, setCommander] = useState<WarAgent | null>(null);
  const [orders, setOrders] = useState<WarOrder[]>([]);
  const [regime, setRegime] = useState<string>("ranging");

  const load = useCallback(async () => {
    if (!user) return;
    const [st, ov, sp, od, ai] = await Promise.all([
      supabase.from("agent_state").select("agent, status, current_task").eq("user_id", user.id),
      supabase.from("agent_overrides").select("agent, override_type").eq("user_id", user.id).eq("active", true),
      supabase.from("commander_specialists").select("id, name, title, mission, last_report").eq("user_id", user.id).eq("active", true).order("created_at"),
      supabase.from("commander_orders").select("id, agent, action, payload, reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("ai_settings").select("current_regime").eq("user_id", user.id).maybeSingle(),
    ]);
    const state = new Map((st.data ?? []).map((r: any) => [r.agent, r]));
    const paused = new Set((ov.data ?? []).filter((r: any) => r.override_type === "pause").map((r: any) => r.agent));
    const norm = (s?: string): AgentStatus => (s === "working" || s === "error" ? s : "idle");
    const core: WarAgent[] = CORE.map((c) => {
      const s: any = state.get(c.id);
      return { ...c, status: paused.has(c.id) ? "paused" : norm(s?.status), task: s?.current_task ?? null, report: null, specialist: false };
    });
    const specs: WarAgent[] = (sp.data ?? []).map((s: any) => ({ id: s.id, name: s.name, title: s.title, status: "idle", task: s.mission, report: s.last_report, specialist: true }));
    const c: any = state.get("commander");
    setCommander({ id: "commander", name: "Kronos", title: "Commander", status: norm(c?.status), task: c?.current_task ?? null, report: null, specialist: false });
    setAgents([...core, ...specs]);
    setOrders((od.data ?? []) as WarOrder[]);
    setRegime(String(ai.data?.current_regime ?? "ranging"));
  }, [user]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  return { agents, commander, orders, regime };
}

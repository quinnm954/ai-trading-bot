import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AgentName = "trader" | "analyst" | "watcher" | "risk" | "healer";

export interface AgentStateRow {
  id: string;
  agent: AgentName;
  status: "idle" | "working" | "waiting" | "paused" | "error";
  current_task: string | null;
  last_heartbeat: string;
  last_cycle_at: string | null;
  cycle_count: number;
  error_count: number;
  metadata: Record<string, unknown>;
}

export interface AgentMessageRow {
  id: string;
  from_agent: string;
  to_agent: string;
  message_type: string;
  subject: string | null;
  payload: Record<string, unknown>;
  priority: "low" | "normal" | "high" | "critical";
  status: "unread" | "read" | "actioned" | "dismissed";
  created_at: string;
}

export interface AgentIncidentRow {
  id: string;
  incident_type: string;
  severity: "info" | "warning" | "error" | "critical";
  description: string;
  remediation: string | null;
  resolved: boolean;
  created_at: string;
}

const AGENTS: AgentName[] = ["watcher", "analyst", "risk", "trader", "healer"];

export function useAgentSystem() {
  const { user } = useAuth();
  const [states, setStates] = useState<AgentStateRow[]>([]);
  const [messages, setMessages] = useState<AgentMessageRow[]>([]);
  const [incidents, setIncidents] = useState<AgentIncidentRow[]>([]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [s, m, i] = await Promise.all([
      supabase.from("agent_state").select("*").eq("user_id", user.id),
      supabase.from("agent_messages").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100),
      supabase.from("agent_incidents").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    ]);
    if (s.data) setStates(s.data as AgentStateRow[]);
    if (m.data) setMessages(m.data as AgentMessageRow[]);
    if (i.data) setIncidents(i.data as AgentIncidentRow[]);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();

    const channel = supabase
      .channel(`agents-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_state" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_messages" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_incidents" }, () => refresh())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, refresh]);

  const runCycle = useCallback(async () => {
    if (!user) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-orchestrator`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    });
  }, [user]);

  const setOverride = useCallback(async (agent: AgentName, override_type: "pause" | "resume" | "veto_next" | "instruction", payload: Record<string, unknown> = {}) => {
    if (!user) return;
    // deactivate any existing override for this agent first
    await supabase.from("agent_overrides")
      .update({ active: false, consumed_at: new Date().toISOString() })
      .eq("user_id", user.id).eq("agent", agent).eq("active", true);
    if (override_type === "resume") {
      await refresh();
      return;
    }
    await supabase.from("agent_overrides").insert([{
      user_id: user.id, agent, override_type, payload, active: true,
    }]);
    await refresh();
  }, [user, refresh]);

  // ensure rows exist for all 5 agents in the UI even before first cycle
  const allAgents: AgentStateRow[] = AGENTS.map((a) => {
    const found = states.find((s) => s.agent === a);
    return found ?? {
      id: a, agent: a, status: "idle", current_task: null,
      last_heartbeat: new Date(0).toISOString(), last_cycle_at: null,
      cycle_count: 0, error_count: 0, metadata: {},
    };
  });

  return { states: allAgents, messages, incidents, refresh, runCycle, setOverride };
}

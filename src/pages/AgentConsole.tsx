import { useAgentSystem, type AgentName } from "@/hooks/useAgentSystem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, Brain, Shield, Bot, Wrench, Play, Pause, Ban, RefreshCw, AlertTriangle, CheckCircle2, GraduationCap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

const AGENT_META: Record<AgentName, { label: string; icon: any; color: string; role: string }> = {
  watcher:  { label: "Market Watcher", icon: Eye,    color: "text-blue-400",   role: "Scans market, positions, regime" },
  analyst:  { label: "Analyst",        icon: Brain,  color: "text-purple-400", role: "Reviews AI decisions & signals" },
  risk:     { label: "Risk Manager",   icon: Shield, color: "text-amber-400",  role: "Validates limits, can veto" },
  trader:   { label: "Trader",         icon: Bot,    color: "text-emerald-400",role: "Executes approved trades" },
  healer:   { label: "Healer",         icon: Wrench, color: "text-rose-400",   role: "Detects failures, self-heals" },
};

const STATUS_VARIANT: Record<string, string> = {
  idle: "bg-muted text-muted-foreground",
  working: "bg-primary/20 text-primary animate-pulse",
  waiting: "bg-amber-500/20 text-amber-400",
  paused: "bg-zinc-500/20 text-zinc-400",
  error: "bg-destructive/20 text-destructive",
};

const PRIORITY_BORDER: Record<string, string> = {
  low: "border-l-muted",
  normal: "border-l-primary/40",
  high: "border-l-amber-500",
  critical: "border-l-destructive",
};

export default function AgentConsole() {
  const { states, messages, incidents, runCycle, setOverride } = useAgentSystem();
  const [running, setRunning] = useState(false);

  const triggerCycle = async () => {
    setRunning(true);
    try { await runCycle(); } finally { setTimeout(() => setRunning(false), 800); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Agent Console</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Five specialized agents coordinating one trading system.
          </p>
        </div>
        <Button onClick={triggerCycle} disabled={running}>
          <RefreshCw className={`w-4 h-4 mr-2 ${running ? "animate-spin" : ""}`} />
          Run cycle now
        </Button>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {states.map((s) => {
          const meta = AGENT_META[s.agent as AgentName];
          if (!meta) return null;
          const Icon = meta.icon;
          const isPaused = s.status === "paused";
          return (
            <Card key={s.agent} className="p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-5 h-5 ${meta.color}`} />
                  <div>
                    <div className="font-semibold text-sm">{meta.label}</div>
                    <div className="text-[10px] text-muted-foreground">{meta.role}</div>
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_VARIANT[s.status]}`}>
                  {s.status}
                </span>
              </div>

              <div className="text-xs text-muted-foreground min-h-[32px]">
                {s.current_task ?? "—"}
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>cycles: {s.cycle_count}</span>
                <span>errors: {s.error_count}</span>
              </div>

              <div className="flex gap-1">
                {isPaused ? (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOverride(s.agent as AgentName, "resume")}>
                    <Play className="w-3 h-3 mr-1" /> Resume
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOverride(s.agent as AgentName, "pause")}>
                    <Pause className="w-3 h-3 mr-1" /> Pause
                  </Button>
                )}
                {s.agent === "trader" && !isPaused && (
                  <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setOverride("trader", "veto_next")}>
                    <Ban className="w-3 h-3 mr-1" /> Veto next
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Message bus */}
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Inter-agent feed</h2>
            <Badge variant="outline" className="text-[10px]">{messages.length} recent</Badge>
          </div>
          <ScrollArea className="h-[500px] pr-3">
            <div className="space-y-2">
              {messages.length === 0 && (
                <div className="text-sm text-muted-foreground py-12 text-center">
                  No messages yet. Run a cycle to see agents communicate.
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className={`border-l-2 ${PRIORITY_BORDER[m.priority]} bg-muted/30 rounded-r px-3 py-2`}>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{m.from_agent}</span>
                      <span>→</span>
                      <span className="font-medium text-foreground">{m.to_agent}</span>
                      <Badge variant="secondary" className="h-4 text-[9px] px-1.5">{m.message_type}</Badge>
                    </div>
                    <span>{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                  </div>
                  <div className="text-sm">{m.subject ?? "(no subject)"}</div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>

        {/* Incidents */}
        <Card className="p-4">
          <h2 className="font-semibold mb-3">Healer log</h2>
          <ScrollArea className="h-[500px] pr-3">
            <div className="space-y-2">
              {incidents.length === 0 && (
                <div className="text-sm text-muted-foreground py-12 text-center">
                  No incidents detected.
                </div>
              )}
              {incidents.map((i) => (
                <div key={i.id} className="border border-border rounded p-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    {i.resolved
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      : <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                    <span className="font-medium">{i.incident_type}</span>
                    <Badge variant="outline" className="h-4 text-[9px] px-1.5 ml-auto">{i.severity}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">{i.description}</div>
                  {i.remediation && (
                    <div className="text-[10px] text-success">→ {i.remediation}</div>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(i.created_at), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}

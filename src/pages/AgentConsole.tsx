import { useAgentSystem, type AgentName, type AgentMessageRow } from "@/hooks/useAgentSystem";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Eye, Brain, Shield, Bot, Wrench, Play, Pause, Ban, RefreshCw,
  AlertTriangle, CheckCircle2, GraduationCap, Radio, Search, X, ChevronDown, ChevronRight, ClipboardCheck,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";

const AGENT_META: Record<AgentName, { label: string; icon: any; color: string; bg: string; role: string }> = {
  watcher:    { label: "Market Watcher", icon: Eye,            color: "text-blue-400",    bg: "bg-blue-400/10",    role: "Scans market, positions, regime" },
  analyst:    { label: "Analyst",        icon: Brain,          color: "text-purple-400",  bg: "bg-purple-400/10",  role: "Reviews signals & runs daily audit" },
  risk:       { label: "Risk Manager",   icon: Shield,         color: "text-amber-400",   bg: "bg-amber-400/10",   role: "Validates limits, can veto" },
  trader:     { label: "Trader",         icon: Bot,            color: "text-emerald-400", bg: "bg-emerald-400/10", role: "Executes approved trades" },
  healer:     { label: "Healer",         icon: Wrench,         color: "text-rose-400",    bg: "bg-rose-400/10",    role: "Detects failures across the app, audits agents, self-heals" },
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

const AGENT_ORDER: AgentName[] = ["watcher", "analyst", "risk", "trader", "healer"];
const ALL_AGENTS: (AgentName | "all")[] = ["watcher", "analyst", "risk", "trader", "healer"];

// Group messages into "cycles". A cycle = burst with no gap > 25s.
function groupCycles(messages: AgentMessageRow[]) {
  if (messages.length === 0) return [] as { id: string; start: string; end: string; messages: AgentMessageRow[] }[];
  // messages are newest-first; reverse for chronological grouping
  const asc = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const groups: AgentMessageRow[][] = [];
  let cur: AgentMessageRow[] = [];
  let lastTs = 0;
  for (const m of asc) {
    const ts = new Date(m.created_at).getTime();
    if (cur.length === 0 || ts - lastTs <= 25_000) {
      cur.push(m);
    } else {
      groups.push(cur);
      cur = [m];
    }
    lastTs = ts;
  }
  if (cur.length) groups.push(cur);
  // newest cycle first
  return groups.reverse().map((g) => ({
    id: g[0].id,
    start: g[0].created_at,
    end: g[g.length - 1].created_at,
    messages: g,
  }));
}

export default function AgentConsole() {
  const { states, messages, incidents, remedies, runCycle, setOverride } = useAgentSystem();
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<"feed" | "timeline">("timeline");
  const [agentFilter, setAgentFilter] = useState<Set<AgentName>>(new Set(ALL_AGENTS as AgentName[]));
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedCycles, setExpandedCycles] = useState<Set<string>>(new Set());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const seenIds = useRef<Set<string>>(new Set());
  const feedRef = useRef<HTMLDivElement>(null);
  const [liveTick, setLiveTick] = useState(0);

  // Flash newly-arrived messages for ~1.5s; track which are truly new since mount
  useEffect(() => {
    const fresh: string[] = [];
    for (const m of messages) {
      if (!seenIds.current.has(m.id)) {
        seenIds.current.add(m.id);
        fresh.push(m.id);
      }
    }
    if (fresh.length && seenIds.current.size > fresh.length) {
      setFlashIds((prev) => {
        const next = new Set(prev);
        fresh.forEach((id) => next.add(id));
        return next;
      });
      setLiveTick((t) => t + 1);
      const timer = setTimeout(() => {
        setFlashIds((prev) => {
          const next = new Set(prev);
          fresh.forEach((id) => next.delete(id));
          return next;
        });
      }, 1500);
      if (autoScroll && feedRef.current) {
        feedRef.current.scrollTop = 0;
      }
      return () => clearTimeout(timer);
    }
  }, [messages, autoScroll]);

  // Heartbeat animation for "Live" indicator
  useEffect(() => {
    const t = setInterval(() => setLiveTick((x) => x + 1), 4000);
    return () => clearInterval(t);
  }, []);

  const triggerCycle = async () => {
    setRunning(true);
    try { await runCycle(); } finally { setTimeout(() => setRunning(false), 800); }
  };

  const messageTypes = useMemo(() => {
    const set = new Set<string>();
    messages.forEach((m) => set.add(m.message_type));
    return Array.from(set).sort();
  }, [messages]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return messages.filter((m) => {
      const fromOk = agentFilter.has(m.from_agent as AgentName);
      const toOk = m.to_agent === "all" || agentFilter.has(m.to_agent as AgentName);
      if (!fromOk && !toOk) return false;
      if (typeFilter !== "all" && m.message_type !== typeFilter) return false;
      if (q) {
        const hay = `${m.subject ?? ""} ${m.message_type} ${m.from_agent} ${m.to_agent}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [messages, agentFilter, typeFilter, search]);

  const cycles = useMemo(() => groupCycles(filtered), [filtered]);

  const toggleAgent = (a: AgentName) => {
    setAgentFilter((prev) => {
      const next = new Set(prev);
      next.has(a) ? next.delete(a) : next.add(a);
      return next.size === 0 ? new Set(ALL_AGENTS as AgentName[]) : next;
    });
  };

  const toggleCycle = (id: string) => {
    setExpandedCycles((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Auto-expand newest cycle
  useEffect(() => {
    if (cycles.length > 0) {
      setExpandedCycles((prev) => prev.has(cycles[0].id) ? prev : new Set([cycles[0].id, ...prev]));
    }
  }, [cycles.length]); // eslint-disable-line

  const clearFilters = () => {
    setAgentFilter(new Set(ALL_AGENTS as AgentName[]));
    setTypeFilter("all");
    setSearch("");
  };

  const filtersActive =
    agentFilter.size !== ALL_AGENTS.length || typeFilter !== "all" || search.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Agent Console</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Five specialized agents coordinating one trading system.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-border text-[11px]">
            <Radio
              key={liveTick}
              className="w-3 h-3 text-emerald-400 animate-pulse"
            />
            <span className="text-muted-foreground">Live</span>
          </div>
          <Button onClick={triggerCycle} disabled={running}>
            <RefreshCw className={`w-4 h-4 mr-2 ${running ? "animate-spin" : ""}`} />
            Run cycle now
          </Button>
        </div>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
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
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Inter-agent activity</h2>
              <Badge variant="outline" className="text-[10px]">
                {filtered.length}/{messages.length}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={view === "timeline" ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setView("timeline")}
              >
                Cycles
              </Button>
              <Button
                size="sm"
                variant={view === "feed" ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setView("feed")}
              >
                Feed
              </Button>
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground ml-2 cursor-pointer select-none">
                <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} className="accent-primary" />
                auto-scroll
              </label>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5 mb-3 items-center">
            {AGENT_ORDER.map((a) => {
              const meta = AGENT_META[a];
              const Icon = meta.icon;
              const on = agentFilter.has(a);
              return (
                <button
                  key={a}
                  onClick={() => toggleAgent(a)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border transition ${
                    on
                      ? `${meta.bg} ${meta.color} border-current`
                      : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/60"
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {meta.label.split(" ")[0]}
                </button>
              );
            })}
            <div className="h-5 w-px bg-border mx-1" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-7 rounded border border-border bg-background px-2 text-[11px]"
            >
              <option value="all">All types</option>
              {messageTypes.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="relative flex-1 min-w-[120px]">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subject…"
                className="h-7 pl-7 text-xs"
              />
            </div>
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-1.5"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>

          <ScrollArea className="h-[500px] pr-3">
            <div ref={feedRef} className="space-y-2">
              {filtered.length === 0 && (
                <div className="text-sm text-muted-foreground py-12 text-center">
                  {messages.length === 0
                    ? "No messages yet. Run a cycle to see agents communicate."
                    : "No messages match the current filters."}
                </div>
              )}

              {view === "feed" && filtered.map((m) => (
                <MessageRow key={m.id} m={m} flash={flashIds.has(m.id)} />
              ))}

              {view === "timeline" && cycles.map((c) => {
                const expanded = expandedCycles.has(c.id);
                const agentsInCycle = new Set(c.messages.map((m) => m.from_agent));
                const durationMs = new Date(c.end).getTime() - new Date(c.start).getTime();
                const hasNew = c.messages.some((m) => flashIds.has(m.id));
                return (
                  <div
                    key={c.id}
                    className={`border rounded transition ${
                      hasNew ? "border-emerald-400/60 bg-emerald-400/5" : "border-border"
                    }`}
                  >
                    <button
                      onClick={() => toggleCycle(c.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 rounded-t"
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      <div className="flex items-center gap-1">
                        {AGENT_ORDER.map((a) => {
                          const meta = AGENT_META[a];
                          const Icon = meta.icon;
                          const present = agentsInCycle.has(a);
                          return (
                            <span
                              key={a}
                              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                present ? `${meta.bg} ${meta.color}` : "bg-muted/30 text-muted-foreground/40"
                              }`}
                              title={meta.label + (present ? " (active)" : " (skipped)")}
                            >
                              <Icon className="w-3 h-3" />
                            </span>
                          );
                        })}
                      </div>
                      <div className="text-xs flex-1">
                        <span className="font-medium">Cycle</span>
                        <span className="text-muted-foreground ml-2">
                          {format(new Date(c.start), "HH:mm:ss")} • {(durationMs / 1000).toFixed(1)}s • {c.messages.length} msgs
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(c.start), { addSuffix: true })}
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-3 pb-2 space-y-1.5">
                        {c.messages.map((m, idx) => (
                          <div key={m.id} className="flex gap-2">
                            <div className="flex flex-col items-center pt-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${AGENT_META[m.from_agent as AgentName]?.color.replace("text-", "bg-") ?? "bg-muted"}`} />
                              {idx < c.messages.length - 1 && (
                                <span className="w-px flex-1 bg-border" />
                              )}
                            </div>
                            <div className="flex-1">
                              <MessageRow m={m} flash={flashIds.has(m.id)} compact />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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

      {/* Healer knowledge base */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-rose-400" />
            <h2 className="font-semibold">Healer learned remedies</h2>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {remedies.length} known patterns
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground mb-3">
          The Healer matches each error to a remedy, applies it, then watches whether the issue recurs to update confidence.
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {remedies.map((r) => {
            const tone = r.confidence >= 70 ? "text-emerald-400" : r.confidence >= 40 ? "text-amber-400" : "text-rose-400";
            return (
              <div key={r.remedy_key} className="border border-border rounded p-2 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-xs">{r.remedy_key}</span>
                  <span className={`text-[10px] font-mono ${tone}`}>{r.confidence.toFixed(0)}%</span>
                </div>
                <div className="text-[11px] text-muted-foreground line-clamp-2">{r.description}</div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>action: <span className="font-mono">{r.action}</span></span>
                  <span>{r.success_count}✓ / {r.failure_count}✗</span>
                </div>
                {r.last_outcome && r.last_applied_at && (
                  <div className="text-[10px] text-muted-foreground">
                    last: {r.last_outcome} • {formatDistanceToNow(new Date(r.last_applied_at), { addSuffix: true })}
                  </div>
                )}
              </div>
            );
          })}
          {remedies.length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground py-6 text-center">
              No remedies registered yet.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function MessageRow({ m, flash, compact }: { m: AgentMessageRow; flash: boolean; compact?: boolean }) {
  const fromMeta = AGENT_META[m.from_agent as AgentName];
  const toMeta = m.to_agent === "all" ? null : AGENT_META[m.to_agent as AgentName];
  return (
    <div
      className={`border-l-2 ${PRIORITY_BORDER[m.priority]} rounded-r px-3 py-2 transition-colors ${
        flash ? "bg-emerald-400/10 ring-1 ring-emerald-400/40" : "bg-muted/30"
      } ${compact ? "py-1.5" : ""}`}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mb-1">
        <div className="flex items-center gap-1.5">
          <span className={`font-medium ${fromMeta?.color ?? "text-foreground"}`}>{m.from_agent}</span>
          <span>→</span>
          <span className={`font-medium ${toMeta?.color ?? "text-foreground"}`}>{m.to_agent}</span>
          <Badge variant="secondary" className="h-4 text-[9px] px-1.5">{m.message_type}</Badge>
          {m.priority === "critical" && (
            <Badge variant="destructive" className="h-4 text-[9px] px-1.5">critical</Badge>
          )}
        </div>
        <span title={new Date(m.created_at).toLocaleString()}>
          {format(new Date(m.created_at), "HH:mm:ss")}
        </span>
      </div>
      <div className="text-sm">{m.subject ?? "(no subject)"}</div>
    </div>
  );
}

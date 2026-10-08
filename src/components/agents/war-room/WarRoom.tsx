import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWarRoomData } from "./useWarRoomData";

const WarRoomScene = lazy(() => import("./WarRoomScene"));

class GLBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div className="h-full grid place-items-center text-sm text-muted-foreground">3D view isn't supported on this device.</div>
      : this.props.children;
  }
}

const STATUS_TEXT: Record<string, string> = { working: "Working", idle: "Idle", paused: "Paused", error: "Error" };

export function WarRoom() {
  const { agents, commander, orders, regime } = useWarRoomData();
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const mobile = useIsMobile();
  const all = commander ? [commander, ...agents] : agents;
  const sel = all.find((a) => a.id === selected) ?? null;
  const selOrders = sel ? orders.filter((o) => o.agent === sel.id || (typeof o.payload?.name === "string" && o.payload.name === sel.name)).slice(0, 3) : [];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div>
          <h2 className="font-semibold">War Room</h2>
          <p className="text-xs text-muted-foreground">Kronos and his team live. {agents.length + 1}/12 seats filled. Tap an agent for details.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse War Room" : "Expand War Room"}>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </Button>
      </div>
      {open && (
        <div className={`relative ${mobile ? "h-[320px]" : "h-[460px]"}`}>
          <GLBoundary>
            <Suspense fallback={<div className="h-full grid place-items-center text-sm text-muted-foreground">Opening the War Room…</div>}>
              <WarRoomScene commander={commander} agents={agents} orders={orders} regime={regime}
                selectedId={selected} onSelect={setSelected} compact={mobile} />
            </Suspense>
          </GLBoundary>
          {sel && (
            <div className="absolute top-3 right-3 w-72 max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card/95 p-3 text-sm shadow-lg space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{sel.name}</div>
                  <div className="text-xs text-muted-foreground">{sel.title}{sel.specialist ? " · hired specialist" : ""}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={sel.status === "error" ? "destructive" : sel.status === "working" ? "default" : "secondary"}>{STATUS_TEXT[sel.status]}</Badge>
                  <button onClick={() => setSelected(null)} aria-label="Close"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {sel.task && <p className="text-xs"><span className="text-muted-foreground">{sel.specialist ? "Mission: " : "Now: "}</span>{sel.task}</p>}
              {sel.report && <p className="text-xs line-clamp-5"><span className="text-muted-foreground">Last report: </span>{sel.report}</p>}
              {selOrders.length > 0 && (
                <ul className="text-xs space-y-1">
                  {selOrders.map((o) => <li key={o.id} className="text-muted-foreground">• {o.action.replace(/_/g, " ")}{typeof o.payload?.symbol === "string" ? ` ${o.payload.symbol}` : ""}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ClipboardCheck, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditReport {
  id: string;
  period_start: string;
  period_end: string;
  total_trades: number;
  wins: number;
  losses: number;
  total_pnl: number;
  win_rate: number;
  worst_loss: number;
  failure_themes: Array<{ title: string; evidence?: string; severity?: string }>;
  recommendations: Array<{ action: string; target: string; reason: string; delta?: number }>;
  applied_adjustments: Array<{ strategy: string; market_regime?: string; delta: number; new_score: number; reason: string }>;
  summary: string;
  created_at: string;
}

export function DailyAuditCard() {
  const { user } = useAuth();
  const [report, setReport] = useState<AuditReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("trade_audit_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setReport(data as AuditReport | null);
    setIsLoading(false);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`audit-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trade_audit_reports", filter: `user_id=eq.${user.id}` },
        load,
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const runNow = async () => {
    if (!user) return;
    setIsRunning(true);
    await supabase.functions.invoke("daily-trade-audit", { body: { user_id: user.id } });
    setIsRunning(false);
    load();
  };

  if (isLoading) {
    return <div className="glass-panel p-6 animate-pulse h-48" />;
  }

  return (
    <div className="glass-panel p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Daily Trade Audit</h3>
        </div>
        <Button size="sm" variant="ghost" onClick={runNow} disabled={isRunning}>
          <RefreshCw className={`w-4 h-4 mr-1 ${isRunning ? "animate-spin" : ""}`} />
          Run now
        </Button>
      </div>

      {!report ? (
        <p className="text-sm text-muted-foreground">
          No audit yet. The bot will review failed trades automatically every day at 00:10 UTC, or run one now.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {new Date(report.created_at).toLocaleString()}
          </p>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Trades (24h)</p>
              <p className="font-bold text-foreground">{report.total_trades}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Win rate</p>
              <p className="font-bold text-foreground">{report.win_rate.toFixed(1)}%</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground">Net P&L</p>
              <p className={`font-bold ${report.total_pnl >= 0 ? "text-profit" : "text-loss"}`}>
                {report.total_pnl >= 0 ? "+" : ""}${report.total_pnl.toFixed(2)}
              </p>
            </div>
          </div>

          {report.summary && (
            <p className="text-sm text-foreground/90">{report.summary}</p>
          )}

          {report.failure_themes?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Failure themes</p>
              <ul className="space-y-1 text-sm">
                {report.failure_themes.slice(0, 4).map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <TrendingDown className="w-4 h-4 text-loss shrink-0 mt-0.5" />
                    <span className="text-foreground/90"><span className="font-medium">{t.title}</span>{t.evidence ? <span className="text-muted-foreground"> — {t.evidence}</span> : null}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.applied_adjustments?.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Self-learning adjustments applied ({report.applied_adjustments.length})
              </p>
              <ul className="space-y-1 text-sm max-h-32 overflow-auto">
                {report.applied_adjustments.slice(0, 8).map((a, i) => (
                  <li key={i} className="flex gap-2">
                    {a.delta >= 0
                      ? <TrendingUp className="w-4 h-4 text-profit shrink-0 mt-0.5" />
                      : <TrendingDown className="w-4 h-4 text-loss shrink-0 mt-0.5" />}
                    <span className="text-foreground/90">
                      <span className="font-medium">{a.strategy}</span>
                      {a.market_regime ? <span className="text-muted-foreground"> · {a.market_regime}</span> : null}
                      <span className={a.delta >= 0 ? "text-profit ml-1" : "text-loss ml-1"}>
                        {a.delta >= 0 ? "+" : ""}{a.delta}
                      </span>
                      <span className="text-muted-foreground"> → score {a.new_score}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

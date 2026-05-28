import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Brain, CheckCircle2, XCircle, ChevronDown, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface FactorScores {
  total_score?: number;
  trend_score?: number;
  ema_alignment_score?: number;
  macd_score?: number;
  rsi_score?: number;
  volume_score?: number;
  vwap_score?: number;
  sr_score?: number;
  volatility_score?: number;
  risk_reward_score?: number;
  risk_reward?: number;
  valid?: boolean;
  [k: string]: number | boolean | undefined;
}

interface AIDecision {
  id: string;
  created_at: string;
  symbol: string | null;
  action: string | null;
  strategy: string | null;
  market_regime: string | null;
  score: number | null;
  valid: boolean | null;
  risk_reward: number | null;
  decision_type: string;
  reasoning: string;
  factor_scores: FactorScores | null;
}

const FACTOR_LABELS: Record<string, string> = {
  trend_score: 'Trend',
  ema_alignment_score: 'EMA Align',
  macd_score: 'MACD',
  rsi_score: 'RSI',
  volume_score: 'Volume',
  vwap_score: 'VWAP',
  sr_score: 'S/R',
  volatility_score: 'Volatility',
  risk_reward_score: 'R/R Score',
};

function inferRejectionReason(d: AIDecision): string | null {
  if (d.valid) return null;
  const fs = d.factor_scores;
  if (!fs) return 'Did not meet acceptance criteria';
  const score = Number(fs.total_score ?? d.score ?? 0);
  if (score < 60) return `Confidence score ${Math.round(score)}/100 below 60 threshold`;
  const rr = Number(fs.risk_reward ?? d.risk_reward ?? 0);
  if (rr && rr < 1.5) return `Risk/Reward ${rr.toFixed(2)} below 1.5 minimum`;
  const weak: string[] = [];
  for (const [k, label] of Object.entries(FACTOR_LABELS)) {
    const v = Number(fs[k] ?? 0);
    if (v > 0 && v < 0.4) weak.push(label);
  }
  if (weak.length) return `Weak factors: ${weak.join(', ')}`;
  return 'Filter or risk-manager gate failed';
}

export function AIDecisionsBreakdownCard() {
  const { user } = useAuth();
  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const fetchDecisions = async () => {
      const { data } = await supabase
        .from('ai_decisions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (!cancelled) {
        setDecisions((data || []) as AIDecision[]);
        setLoading(false);
      }
    };

    fetchDecisions();

    const channel = supabase
      .channel(`ai-decisions-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ai_decisions', filter: `user_id=eq.${user.id}` },
        () => fetchDecisions(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="w-4 h-4 text-primary" />
          AI Decision Breakdown
          <Badge variant="outline" className="ml-auto text-xs font-normal">
            Last {decisions.length}
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Every attempted trade — signals, regime, filters, and accept/reject reason.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground text-center">Loading decisions…</div>
        ) : decisions.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            No AI decisions yet. They'll appear here on the next trading cycle.
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[520px] overflow-y-auto">
            {decisions.map((d) => {
              const accepted = !!d.valid;
              const score = d.score ?? d.factor_scores?.total_score ?? null;
              const rejection = inferRejectionReason(d);
              const isOpen = openId === d.id;
              const isExecution = d.decision_type === 'ai_trade_execution';

              return (
                <Collapsible
                  key={d.id}
                  open={isOpen}
                  onOpenChange={(o) => setOpenId(o ? d.id : null)}
                >
                  <CollapsibleTrigger asChild>
                    <button className="w-full text-left p-3 hover:bg-secondary/40 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {accepted ? (
                            <CheckCircle2 className="w-4 h-4 text-success" />
                          ) : isExecution ? (
                            <XCircle className="w-4 h-4 text-loss" />
                          ) : (
                            <Activity className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm text-foreground">
                              {d.symbol || '—'}
                            </span>
                            {d.action && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] uppercase px-1.5 py-0',
                                  d.action === 'buy' && 'border-success/40 text-success',
                                  d.action === 'sell' && 'border-loss/40 text-loss',
                                )}
                              >
                                {d.action}
                              </Badge>
                            )}
                            {d.strategy && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {d.strategy}
                              </Badge>
                            )}
                            {d.market_regime && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {d.market_regime}
                              </Badge>
                            )}
                            {score != null && (
                              <span
                                className={cn(
                                  'text-xs font-mono ml-auto',
                                  Number(score) >= 70
                                    ? 'text-success'
                                    : Number(score) >= 60
                                      ? 'text-warning'
                                      : 'text-loss',
                                )}
                              >
                                {Math.round(Number(score))}/100
                              </span>
                            )}
                            <ChevronDown
                              className={cn(
                                'w-3.5 h-3.5 text-muted-foreground transition-transform',
                                isOpen && 'rotate-180',
                              )}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 truncate">
                            {accepted ? (
                              <span className="text-success">✓ Accepted</span>
                            ) : (
                              <span className="text-loss">✗ Rejected:</span>
                            )}{' '}
                            {rejection || d.reasoning}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {new Date(d.created_at).toLocaleTimeString()} ·{' '}
                            {d.decision_type.replace(/_/g, ' ')}
                          </p>
                        </div>
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-4 pl-10 space-y-3">
                      {d.factor_scores && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                            Signal Factors
                          </p>
                          <div className="grid grid-cols-3 gap-1.5">
                            {Object.entries(FACTOR_LABELS).map(([k, label]) => {
                              const v = d.factor_scores?.[k];
                              if (v == null) return null;
                              const num = Number(v);
                              return (
                                <div
                                  key={k}
                                  className="flex items-center justify-between rounded bg-secondary/40 px-2 py-1 text-[11px]"
                                >
                                  <span className="text-muted-foreground">{label}</span>
                                  <span
                                    className={cn(
                                      'font-mono',
                                      num >= 0.7
                                        ? 'text-success'
                                        : num >= 0.4
                                          ? 'text-warning'
                                          : 'text-loss',
                                    )}
                                  >
                                    {num.toFixed(2)}
                                  </span>
                                </div>
                              );
                            })}
                            {d.risk_reward != null && (
                              <div className="flex items-center justify-between rounded bg-secondary/40 px-2 py-1 text-[11px]">
                                <span className="text-muted-foreground">R/R</span>
                                <span className="font-mono text-foreground">
                                  {Number(d.risk_reward).toFixed(2)}:1
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          Reasoning
                        </p>
                        <p className="text-xs text-foreground/90 whitespace-pre-wrap break-words">
                          {d.reasoning}
                        </p>
                      </div>

                      {!accepted && rejection && (
                        <div className="rounded border border-loss/30 bg-loss/5 px-2.5 py-1.5">
                          <p className="text-[10px] uppercase tracking-wide text-loss mb-0.5">
                            Why rejected
                          </p>
                          <p className="text-xs text-foreground/90">{rejection}</p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

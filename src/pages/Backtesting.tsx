import { useCallback, useEffect, useRef, useState } from 'react';
import { FlaskConical, Loader2, TrendingUp, TrendingDown, Target, ShieldAlert, Clock, Lock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { SeoHead } from '@/components/seo/SeoHead';

interface Job {
  id: string;
  label: string | null;
  phase: string;
  asset_class: string | null;
  universe: string[] | null;
  period_days: number;
  range_start: string;
  range_end: string;
  sync_cursor: number | null;
  replay_cursor: number | null;
  candles_loaded: number | null;
  progress_note: string | null;
  error: string | null;
  run_group_id: string;
  // deno-lint-ignore no-explicit-any
  summary: any;
}

interface Run {
  id: string;
  symbol: string;
  period_days: number;
  total_return: number;
  win_rate: number;
  max_drawdown: number;
  profit_factor: number;
  trades_count: number;
  best_trade: number;
  worst_trade: number;
  avg_win: number;
  avg_loss: number;
  created_at: string;
  // deno-lint-ignore no-explicit-any
  details: any;
}

const money = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (v: number, dp = 2) => `${(v ?? 0) > 0 ? '+' : ''}${(v ?? 0).toFixed(dp)}%`;

export default function Backtesting() {
  const { user } = useAuth();
  const [assetClass, setAssetClass] = useState<'crypto' | 'stocks'>('crypto');
  const [days, setDays] = useState('90');
  const [universeSize, setUniverseSize] = useState('30');
  const [job, setJob] = useState<Job | null>(null);
  const [starting, setStarting] = useState(false);
  const [groups, setGroups] = useState<Run[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const ticking = useRef(false);

  const loadResults = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('user_id', user.id)
      .eq('strategy', 'live_engine_replay')
      .order('created_at', { ascending: false })
      .limit(600);
    const byGroup = new Map<string, Run[]>();
    for (const r of (data as Run[]) ?? []) {
      const g = r.details?.run_group_id ?? r.id;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(r);
    }
    const list = [...byGroup.values()].filter((rows) => rows.some((r) => r.symbol === 'PORTFOLIO'));
    setGroups(list);
    setSelected((prev) => prev ?? list[0]?.[0]?.details?.run_group_id ?? null);
  }, [user]);

  useEffect(() => { loadResults(); }, [loadResults]);

  // Stock replay steps MINUTE bars through the session clock, so the same wall-clock
  // budget covers a shorter window and fewer names than a crypto run.
  useEffect(() => {
    if (assetClass === 'stocks') { setDays('30'); setUniverseSize('10'); }
    else { setDays('90'); setUniverseSize('30'); }
  }, [assetClass]);

  // Resume any job left running (the work happens on the server; this only polls).
  useEffect(() => {
    if (!user) return;
    supabase
      .from('backtest_jobs')
      .select('*')
      .eq('user_id', user.id)
      .in('phase', ['pending', 'syncing', 'replaying'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setJob(data as unknown as Job); });
  }, [user]);

  // Drive the job forward one chunk at a time.
  useEffect(() => {
    if (!job || ['done', 'failed'].includes(job.phase) || ticking.current) return;
    ticking.current = true;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('backtest-replay', {
          body: { action: 'tick', jobId: job.id },
        });
        if (error) throw new Error(error.message);
        if (data?.job) {
          setJob(data.job as Job);
          if (data.job.phase === 'done') {
            toast({ title: 'Backtest complete', description: data.job.progress_note ?? '' });
            loadResults();
          }
          if (data.job.phase === 'failed') {
            toast({ title: 'Backtest failed', description: data.job.error ?? '', variant: 'destructive' });
          }
        }
      } catch (e) {
        toast({ title: 'Backtest interrupted', description: (e as Error).message, variant: 'destructive' });
        setJob((j) => (j ? { ...j, phase: 'failed', error: (e as Error).message } : j));
      } finally {
        ticking.current = false;
      }
    })();
  }, [job, loadResults]);

  const start = async () => {
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke('backtest-replay', {
        body: {
          action: 'start',
          label: `${assetClass === 'stocks' ? 'Stocks' : 'Crypto'} ${days}d replay · top ${universeSize} markets`,
          overrides: { days: Number(days), universeSize: Number(universeSize), assetClass },
        },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Could not start');
      setJob(data.job as Job);
      toast({ title: 'Backtest started', description: 'Loading historical candles — this keeps running on the server.' });
    } catch (e) {
      toast({ title: 'Could not start backtest', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const active = job && !['done', 'failed'].includes(job.phase);
  const total = job?.universe?.length ?? 1;
  const progress = job
    ? job.phase === 'syncing'
      ? ((job.sync_cursor ?? 0) / total) * 50
      : 50 + ((job.replay_cursor ?? 0) / total) * 50
    : 0;

  const rows = groups.find((g) => (g[0]?.details?.run_group_id ?? g[0]?.id) === selected) ?? groups[0] ?? [];
  const portfolio = rows.find((r) => r.symbol === 'PORTFOLIO');
  const perSymbol = rows.filter((r) => r.symbol !== 'PORTFOLIO').sort((a, b) => (b.details?.net_pnl ?? 0) - (a.details?.net_pnl ?? 0));
  const exits = portfolio?.details?.exit_breakdown ?? {};
  const vetoes: [string, number][] = Object.entries(portfolio?.details?.playbook_veto_tally ?? {})
    .map(([k, v]) => [k, Number(v)] as [string, number])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <SeoHead
        title="Strategy Backtesting | Titan AI Trader"
        description="Replay the live Titan AI trading rules over real Coinbase and Alpaca history and store the evidence before changing any parameter."
        path="/backtesting"
        noindex
      />

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6 text-primary" /> Historical Validation
        </h1>
        <p className="text-sm text-muted-foreground">
          Replays the exact live rules — entry playbook, market stand-down gate and fee-aware exits — over real
          historical candles — 5-minute Coinbase bars for crypto, 1-minute Alpaca bars for stocks so session VWAP,
          the opening range and relative volume replay faithfully. Evaluation only: nothing here places trades or changes your settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New run</CardTitle>
          <CardDescription>Uses your current live parameters as-is, so the result is a read on the setup you are actually running.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label>Market</Label>
              <Select value={assetClass} onValueChange={(v) => setAssetClass(v as 'crypto' | 'stocks')} disabled={!!active}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="crypto">Crypto (Coinbase)</SelectItem>
                  <SelectItem value="stocks">Stocks (Alpaca)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>History</Label>
              <Select value={days} onValueChange={setDays} disabled={!!active}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {assetClass === 'stocks' ? (
                    <>
                      <SelectItem value="20">20 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="45">45 days</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="120">120 days</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Markets</Label>
              <Select value={universeSize} onValueChange={setUniverseSize} disabled={!!active}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">Top 10 by volume</SelectItem>
                  <SelectItem value="20">Top 20 by volume</SelectItem>
                  {assetClass === 'crypto' && <SelectItem value="30">Top 30 by volume</SelectItem>}
                  {assetClass === 'crypto' && <SelectItem value="50">Top 50 by volume</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={start} disabled={!!active || starting} className="w-full">
                {starting || active ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
                {active ? 'Running…' : 'Run backtest'}
              </Button>
            </div>
          </div>

          {job && (
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium capitalize">{job.phase}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{job.asset_class === 'stocks' ? 'Stocks' : 'Crypto'}</Badge>
                  <Badge variant="outline">{job.period_days}d · {job.universe?.length ?? 0} markets</Badge>
                </div>
              </div>
              <Progress value={active ? progress : 100} />
              <p className="text-xs text-muted-foreground">{job.error ?? job.progress_note}</p>
              {job.summary?.tape && (
                <p className="text-xs text-muted-foreground">
                  {job.asset_class === 'stocks'
                    ? `Market gate was open on ${job.summary.tape.days_open}/${job.summary.tape.days_evaluated} sessions (${((job.summary.tape.open_share ?? 0) * 100).toFixed(0)}% of the period).`
                    : `Market gate was open ${job.summary.tape.hours_open}/${job.summary.tape.hours_evaluated} hours (${((job.summary.tape.open_share ?? 0) * 100).toFixed(0)}% of the period).`}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {groups.length > 1 && (
        <div className="space-y-2 max-w-sm">
          <Label>Stored run</Label>
          <Select value={selected ?? ''} onValueChange={setSelected}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {groups.map((g) => {
                const p = g.find((r) => r.symbol === 'PORTFOLIO') ?? g[0];
                const id = p.details?.run_group_id ?? p.id;
                return (
                  <SelectItem key={id} value={id}>
                    {new Date(p.created_at).toLocaleString()} · {p.period_days}d · {p.trades_count} trades
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      )}

      {portfolio && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Trades" value={String(portfolio.trades_count)} sub={`${portfolio.details?.wins ?? 0}W / ${portfolio.details?.losses ?? 0}L`} />
            <Metric label="Win rate" value={`${(portfolio.win_rate ?? 0).toFixed(1)}%`} sub={`avg hold ${Math.round((portfolio.details?.avg_hold_minutes ?? 0) / 60)}h`} />
            <Metric
              label="Expectancy / trade"
              value={money(portfolio.details?.expectancy_usd ?? 0)}
              sub={pct(portfolio.details?.expectancy_pct ?? 0)}
              positive={(portfolio.details?.expectancy_usd ?? 0) > 0}
            />
            <Metric
              label="Net P&L"
              value={money(portfolio.details?.net_pnl ?? 0)}
              sub={`${pct(portfolio.total_return)} · PF ${(portfolio.profit_factor ?? 0).toFixed(2)}`}
              positive={(portfolio.details?.net_pnl ?? 0) > 0}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">How trades ended</CardTitle>
                <CardDescription>Target vs stop vs profit lock vs time expiry.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { key: 'target', label: 'Hit target', icon: Target },
                  { key: 'profit_lock', label: 'Profit locked', icon: Lock },
                  { key: 'stop', label: 'Stopped out', icon: ShieldAlert },
                  { key: 'max_hold', label: 'Time expiry', icon: Clock },
                ].map(({ key, label, icon: Icon }) => {
                  const e = exits[key] ?? { count: 0, share: 0, pnl: 0 };
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" />{label}</span>
                        <span className="tabular-nums">
                          {e.count} · <span className={e.pnl >= 0 ? 'text-success' : 'text-destructive'}>{money(e.pnl)}</span>
                        </span>
                      </div>
                      <Progress value={(e.share ?? 0) * 100} />
                    </div>
                  );
                })}
                <div className="pt-2 text-xs text-muted-foreground space-y-1">
                  <p>Best trade {money(portfolio.best_trade)} · worst {money(portfolio.worst_trade)} · max drawdown {(portfolio.max_drawdown ?? 0).toFixed(2)}%</p>
                  <p>Avg win {money(portfolio.avg_win)} ({pct(portfolio.details?.avg_win_pct ?? 0)}) · avg loss {money(portfolio.avg_loss)} ({pct(portfolio.details?.avg_loss_pct ?? 0)})</p>
                  <p>{portfolio.details?.signals_skipped_no_slot ?? 0} signals skipped with all {portfolio.details?.slot_cap} slots full.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Why entries were rejected</CardTitle>
                <CardDescription>Most common playbook veto across the period.</CardDescription>
              </CardHeader>
              <CardContent>
                {vetoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No veto data stored for this run.</p>
                ) : (
                  <div className="space-y-2">
                    {vetoes.map(([reason, count]) => (
                      <div key={reason} className="flex items-center justify-between text-sm">
                        <span className="capitalize">{reason.replace(/_/g, ' ')}</span>
                        <span className="tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Per market</CardTitle>
              <CardDescription>Each market on its own, before the concurrency cap is applied.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[420px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left p-3">Market</th>
                      <th className="text-right p-3">Trades</th>
                      <th className="text-right p-3">Win rate</th>
                      <th className="text-right p-3">Expectancy</th>
                      <th className="text-right p-3">Net P&L</th>
                      <th className="text-right p-3">Target/Stop</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perSymbol.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{r.symbol}</td>
                        <td className="p-3 text-right tabular-nums">{r.trades_count}</td>
                        <td className="p-3 text-right tabular-nums">{(r.win_rate ?? 0).toFixed(0)}%</td>
                        <td className="p-3 text-right tabular-nums">{money(r.details?.expectancy_usd ?? 0)}</td>
                        <td className={`p-3 text-right tabular-nums ${(r.details?.net_pnl ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
                          <span className="inline-flex items-center gap-1">
                            {(r.details?.net_pnl ?? 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {money(r.details?.net_pnl ?? 0)}
                          </span>
                        </td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">
                          {r.details?.exit_breakdown?.target?.count ?? 0}/{r.details?.exit_breakdown?.stop?.count ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}

      {!portfolio && !active && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No stored runs yet. Start a backtest to build the first evidence set.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Metric({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold ${positive === undefined ? '' : positive ? 'text-success' : 'text-destructive'}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

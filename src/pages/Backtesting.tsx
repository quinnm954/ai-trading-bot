import { useEffect, useState } from 'react';
import { FlaskConical, Loader2, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

const STRATEGIES = [
  { id: 'ema_crossover', label: 'EMA Crossover' },
  { id: 'rsi_reversal', label: 'RSI Reversal' },
  { id: 'vwap_bounce', label: 'VWAP Bounce' },
  { id: 'breakout_volume', label: 'Breakout with Volume' },
  { id: 'pullback_continuation', label: 'Pullback Continuation' },
  { id: 'trend_scalp', label: 'Trend Scalp' },
];

const SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOGE', 'MATIC', 'LINK'];

interface Run {
  id: string;
  symbol: string;
  strategy: string;
  timeframe: string;
  period_days: number;
  initial_balance: number;
  ending_balance: number;
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
}

export default function Backtesting() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState('BTC');
  const [strategy, setStrategy] = useState('ema_crossover');
  const [days, setDays] = useState(30);
  const [initialBalance, setInitialBalance] = useState(10000);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user]);

  const refresh = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setRuns((data as Run[]) || []);
  };

  const runBacktest = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('backtest-runner', {
        body: { symbol, strategy, days, initialBalance },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Backtest failed');
      toast({ title: 'Backtest complete', description: `${data.run.trades_count} trades · ${data.run.total_return.toFixed(2)}% return` });
      refresh();
    } catch (e: any) {
      toast({ title: 'Backtest failed', description: e.message, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  // Ranking: best total_return per strategy across runs
  const ranking = Object.values(
    runs.reduce<Record<string, Run>>((acc, r) => {
      if (!acc[r.strategy] || r.total_return > acc[r.strategy].total_return) acc[r.strategy] = r;
      return acc;
    }, {}),
  ).sort((a, b) => b.total_return - a.total_return);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <FlaskConical className="w-7 h-7 text-primary" /> Backtesting
        </h1>
        <p className="text-sm text-muted-foreground">Replay strategies against historical candles.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>New Run</CardTitle>
            <CardDescription>Pick a strategy, pair and period.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Symbol</Label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SYMBOLS.map((s) => <SelectItem key={s} value={s}>{s}/USD</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Strategy</Label>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STRATEGIES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period (days)</Label>
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[7, 14, 30, 90, 180, 365].map((d) => <SelectItem key={d} value={String(d)}>{d} days</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Initial Balance ($)</Label>
              <Input type="number" value={initialBalance} onChange={(e) => setInitialBalance(Number(e.target.value))} />
            </div>
            <Button onClick={runBacktest} disabled={running} className="w-full">
              {running ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running…</> : 'Run Backtest'}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Strategy Ranking</CardTitle>
            <CardDescription>Best run per strategy.</CardDescription>
          </CardHeader>
          <CardContent>
            {ranking.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No backtests yet.</p>
            ) : (
              <div className="space-y-2">
                {ranking.map((r, i) => (
                  <div key={r.strategy} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                    <div className="flex items-center gap-3">
                      <Badge variant={i === 0 ? 'default' : 'outline'}>#{i + 1}</Badge>
                      <div>
                        <p className="font-medium text-foreground">{r.strategy}</p>
                        <p className="text-xs text-muted-foreground">{r.symbol} · {r.period_days}d · {r.trades_count} trades</p>
                      </div>
                    </div>
                    <div className={r.total_return >= 0 ? 'text-success font-bold' : 'text-loss font-bold'}>
                      {r.total_return >= 0 ? '+' : ''}{r.total_return.toFixed(2)}%
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Run History</CardTitle></CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No runs yet — run a backtest above.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2">When</th>
                    <th className="text-left py-2">Pair</th>
                    <th className="text-left py-2">Strategy</th>
                    <th className="text-right py-2">Period</th>
                    <th className="text-right py-2">Return</th>
                    <th className="text-right py-2">Win Rate</th>
                    <th className="text-right py-2">Max DD</th>
                    <th className="text-right py-2">PF</th>
                    <th className="text-right py-2">Trades</th>
                    <th className="text-right py-2">Best</th>
                    <th className="text-right py-2">Worst</th>
                    <th className="text-right py-2">Avg Win</th>
                    <th className="text-right py-2">Avg Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="py-2">{r.symbol}</td>
                      <td className="py-2 text-xs">{r.strategy}</td>
                      <td className="py-2 text-right">{r.period_days}d</td>
                      <td className={`py-2 text-right font-medium ${r.total_return >= 0 ? 'text-success' : 'text-loss'}`}>
                        {r.total_return >= 0 ? '+' : ''}{r.total_return.toFixed(2)}%
                      </td>
                      <td className="py-2 text-right">{r.win_rate.toFixed(1)}%</td>
                      <td className="py-2 text-right text-loss">{r.max_drawdown.toFixed(2)}%</td>
                      <td className="py-2 text-right">{r.profit_factor.toFixed(2)}</td>
                      <td className="py-2 text-right">{r.trades_count}</td>
                      <td className="py-2 text-right text-success">+${r.best_trade.toFixed(2)}</td>
                      <td className="py-2 text-right text-loss">${r.worst_trade.toFixed(2)}</td>
                      <td className="py-2 text-right">${r.avg_win.toFixed(2)}</td>
                      <td className="py-2 text-right">${r.avg_loss.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

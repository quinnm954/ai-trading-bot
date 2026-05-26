import { useEffect, useState } from 'react';
import { Sliders, Loader2, ShieldOff } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

interface StrategyRow {
  id: string;
  strategy: string;
  market_regime: string;
  enabled: boolean;
  score: number;
  win_rate: number;
  total_trades: number;
  avg_profit: number;
  max_drawdown: number;
  profit_factor: number;
  best_trade: number;
  worst_trade: number;
  avg_win: number;
  avg_loss: number;
}

const REQUIRED = ['ema_crossover', 'rsi_reversal', 'vwap_bounce', 'breakout_volume', 'pullback_continuation', 'trend_scalp'];

export default function StrategyControlCenter() {
  const { user } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [rows, setRows] = useState<StrategyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Seed any missing required strategies for this user
      const { data: existing } = await supabase
        .from('strategy_performance')
        .select('strategy')
        .eq('user_id', user.id);
      const present = new Set((existing || []).map((r: any) => r.strategy));
      const toInsert = REQUIRED.filter((s) => !present.has(s)).map((s) => ({
        user_id: user.id,
        strategy: s as any,
        market_regime: 'ranging' as any,
        score: 50,
        win_rate: 0,
        total_trades: 0,
        avg_profit: 0,
        enabled: true,
      }));
      if (toInsert.length) await supabase.from('strategy_performance').insert(toInsert as any);

      const { data } = await supabase
        .from('strategy_performance')
        .select('*')
        .eq('user_id', user.id)
        .order('score', { ascending: false });
      setRows((data as StrategyRow[]) || []);
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (row: StrategyRow, enabled: boolean) => {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, enabled } : r)));
    const { error } = await supabase.from('strategy_performance').update({ enabled } as any).eq('id', row.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, enabled: !enabled } : r)));
    }
  };

  if (adminLoading) return <Loader2 className="w-6 h-6 animate-spin mx-auto mt-12" />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Sliders className="w-7 h-7 text-primary" /> Strategy Control Center
        </h1>
        <p className="text-sm text-muted-foreground">Toggle strategies on or off and review recent performance.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Strategies</CardTitle>
          <CardDescription>Disabled strategies are excluded from autonomous selection.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="w-6 h-6 animate-spin mx-auto my-12" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left py-2">Strategy</th>
                    <th className="text-left py-2">Regime</th>
                    <th className="text-right py-2">Score</th>
                    <th className="text-right py-2">Win Rate</th>
                    <th className="text-right py-2">Trades</th>
                    <th className="text-right py-2">Avg Profit</th>
                    <th className="text-right py-2">Max DD</th>
                    <th className="text-right py-2">Profit Factor</th>
                    <th className="text-right py-2">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{r.strategy}</span>
                          {!r.enabled && <Badge variant="outline" className="text-xs"><ShieldOff className="w-3 h-3 mr-1" /> off</Badge>}
                        </div>
                      </td>
                      <td className="py-3 text-xs text-muted-foreground">{r.market_regime}</td>
                      <td className="py-3 text-right font-mono">{Math.round(r.score)}</td>
                      <td className="py-3 text-right">{Number(r.win_rate).toFixed(1)}%</td>
                      <td className="py-3 text-right">{r.total_trades}</td>
                      <td className={`py-3 text-right ${Number(r.avg_profit) >= 0 ? 'text-success' : 'text-loss'}`}>
                        ${Number(r.avg_profit).toFixed(2)}
                      </td>
                      <td className="py-3 text-right text-loss">{Number(r.max_drawdown || 0).toFixed(2)}%</td>
                      <td className="py-3 text-right">{Number(r.profit_factor || 0).toFixed(2)}</td>
                      <td className="py-3 text-right">
                        <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r, v)} />
                      </td>
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

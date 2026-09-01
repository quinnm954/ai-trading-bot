import { useEffect, useState, useCallback } from 'react';
import { Calculator, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ExpectancyRow {
  strategy: string;
  sample_size: number;
  win_rate: number;
  avg_win: number;
  avg_loss: number;
  net_pnl: number;
  expectancy_per_trade: number;
}

interface Props {
  isPaper: boolean;
}

/**
 * Expectancy is the only number that says whether a strategy can make money:
 *   expectancy = (win rate x avg win) - (loss rate x avg loss), fees included.
 * Negative expectancy means more trading loses more money, regardless of win rate.
 */
export function ExpectancyCard({ isPaper }: Props) {
  const { user } = useAuth();
  const [rows, setRows] = useState<ExpectancyRow[]>([]);
  const [tradesPerDay, setTradesPerDay] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: expData }, { data: tradeData }] = await Promise.all([
      supabase
        .from('strategy_expectancy')
        .select('strategy, sample_size, win_rate, avg_win, avg_loss, net_pnl, expectancy_per_trade')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper),
      supabase
        .from('trades')
        .select('closed_at')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper)
        .eq('status', 'closed')
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: true }),
    ]);

    setRows((expData ?? []) as ExpectancyRow[]);

    const closes = (tradeData ?? []).map(t => new Date(t.closed_at as string).getTime());
    if (closes.length >= 2) {
      const spanDays = Math.max((closes[closes.length - 1] - closes[0]) / 86_400_000, 1 / 24);
      setTradesPerDay(closes.length / spanDays);
    } else {
      setTradesPerDay(closes.length);
    }

    setIsLoading(false);
  }, [user, isPaper]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const totalTrades = rows.reduce((s, r) => s + Number(r.sample_size || 0), 0);
  const blendedExpectancy = totalTrades > 0
    ? rows.reduce((s, r) => s + Number(r.expectancy_per_trade || 0) * Number(r.sample_size || 0), 0) / totalTrades
    : 0;
  const dailyProjection = blendedExpectancy * tradesPerDay;
  const positive = blendedExpectancy > 0;

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('p-2.5 rounded-xl', positive ? 'bg-success/20' : 'bg-destructive/20')}>
            <Calculator className={cn('w-5 h-5', positive ? 'text-success' : 'text-destructive')} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Expectancy</h3>
            <p className="text-xs text-muted-foreground">
              Fee-inclusive, trailing 20 trades per strategy ({isPaper ? 'paper' : 'live'})
            </p>
          </div>
        </div>
        {positive
          ? <TrendingUp className="w-5 h-5 text-success" />
          : <TrendingDown className="w-5 h-5 text-destructive" />}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-24">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : totalTrades === 0 ? (
        <p className="text-sm text-muted-foreground">
          No closed trades yet. Expectancy appears once the bot has completed trades.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">Per trade</p>
              <p className={cn('font-mono text-lg font-semibold', positive ? 'text-success' : 'text-destructive')}>
                {blendedExpectancy >= 0 ? '+' : '-'}${Math.abs(blendedExpectancy).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trades / day</p>
              <p className="font-mono text-lg font-semibold text-foreground">{tradesPerDay.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projected / day</p>
              <p className={cn('font-mono text-lg font-semibold', dailyProjection >= 0 ? 'text-success' : 'text-destructive')}>
                {dailyProjection >= 0 ? '+' : '-'}${Math.abs(dailyProjection).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {rows.map(r => {
              const exp = Number(r.expectancy_per_trade || 0);
              const ok = exp > 0;
              return (
                <div key={r.strategy} className="flex items-center justify-between text-xs py-2 border-t border-border/40">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground capitalize">{r.strategy}</span>
                    <span className={cn(
                      'px-1.5 py-0.5 rounded text-[10px] font-medium',
                      ok ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning',
                    )}>
                      {ok ? 'trading' : 'probation'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 font-mono text-muted-foreground">
                    <span>{Number(r.win_rate).toFixed(0)}% WR</span>
                    <span>W ${Number(r.avg_win).toFixed(2)}</span>
                    <span>L ${Math.abs(Number(r.avg_loss)).toFixed(2)}</span>
                    <span className={ok ? 'text-success' : 'text-destructive'}>
                      {exp >= 0 ? '+' : '-'}${Math.abs(exp).toFixed(2)}/trade
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {!positive && (
            <p className="mt-3 text-xs text-warning">
              Negative expectancy: strategies on probation trade one slot at half size until the math recovers.
              More trading at negative expectancy loses more money.
            </p>
          )}
        </>
      )}
    </div>
  );
}

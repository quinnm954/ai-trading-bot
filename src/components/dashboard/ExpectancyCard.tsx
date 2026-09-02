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
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: expData }, { data: tradeData }, { data: posData }] = await Promise.all([
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
      supabase
        .from('positions')
        .select('symbol, side, quantity, avg_entry_price, strategy')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper),
    ]);

    setRows((expData ?? []) as ExpectancyRow[]);
    setOpenPositions((posData ?? []) as OpenPosition[]);

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
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  // Realtime: any trade or position change re-reads expectancy immediately.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`expectancy-live-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  // Live market rates for every open position — expectancy is marked to market,
  // not to the cached current_price column.
  const { prices, updatedAt } = useLivePrices(openPositions.map(p => p.symbol), 15_000);

  // Blend open positions (at live prices) into each strategy's stats so win rate
  // and expectancy move with the ticker instead of only on trade close.
  const liveRows: LiveRow[] = rows.map((r) => {
    const strategyPositions = openPositions.filter(
      p => (p.strategy ?? 'scalp').toLowerCase() === r.strategy.toLowerCase(),
    );

    let openPnl = 0;
    let openCount = 0;
    let openWins = 0;
    for (const p of strategyPositions) {
      const price = prices[p.symbol.toUpperCase()];
      if (!price) continue;
      const entry = Number(p.avg_entry_price);
      const qty = Number(p.quantity);
      const pnl = p.side === 'sell' ? (entry - price) * qty : (price - entry) * qty;
      openPnl += pnl;
      openCount += 1;
      if (pnl > 0) openWins += 1;
    }

    const closedSample = Number(r.sample_size || 0);
    const closedWins = (Number(r.win_rate || 0) / 100) * closedSample;
    const sample = closedSample + openCount;
    const liveWinRate = sample > 0 ? ((closedWins + openWins) / sample) * 100 : Number(r.win_rate || 0);
    const closedNet = Number(r.expectancy_per_trade || 0) * closedSample;
    const liveExpectancy = sample > 0 ? (closedNet + openPnl) / sample : Number(r.expectancy_per_trade || 0);

    return { ...r, liveWinRate, liveExpectancy, liveSample: sample, openCount, openPnl };
  });

  const totalTrades = rows.reduce((s, r) => s + Number(r.sample_size || 0), 0);
  const blendedExpectancy = totalTrades > 0
    ? rows.reduce((s, r) => s + Number(r.expectancy_per_trade || 0) * Number(r.sample_size || 0), 0) / totalTrades
    : 0;
  const dailyProjection = blendedExpectancy * tradesPerDay;
  const positive = blendedExpectancy > 0;

  return (
    <div className="glass-panel p-4 sm:p-6">
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
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <div>
              <p className="text-xs text-muted-foreground">Per trade</p>
              <p className={cn('font-mono text-base sm:text-lg font-semibold', positive ? 'text-success' : 'text-destructive')}>
                {blendedExpectancy >= 0 ? '+' : '-'}${Math.abs(blendedExpectancy).toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Trades / day</p>
              <p className="font-mono text-base sm:text-lg font-semibold text-foreground">{tradesPerDay.toFixed(1)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Projected / day</p>
              <p className={cn('font-mono text-base sm:text-lg font-semibold', dailyProjection >= 0 ? 'text-success' : 'text-destructive')}>
                {dailyProjection >= 0 ? '+' : '-'}${Math.abs(dailyProjection).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {rows.map(r => {
              const exp = Number(r.expectancy_per_trade || 0);
              const ok = exp > 0;
              return (
                <div key={r.strategy} className="flex flex-col gap-1.5 text-xs py-2.5 border-t border-border/40 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-foreground capitalize truncate">{r.strategy}</span>
                    <span className={cn(
                      'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium',
                      ok ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning',
                    )}>
                      {ok ? 'trading' : 'probation'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground sm:text-xs sm:gap-4">
                    <span>{Number(r.win_rate).toFixed(0)}% WR</span>
                    <span>W ${Number(r.avg_win).toFixed(2)}</span>
                    <span>L ${Math.abs(Number(r.avg_loss)).toFixed(2)}</span>
                    <span className={cn('whitespace-nowrap', ok ? 'text-success' : 'text-destructive')}>
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

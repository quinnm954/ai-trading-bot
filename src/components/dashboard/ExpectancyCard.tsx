import { useEffect, useState, useCallback } from 'react';
import { Calculator, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLivePrices } from '@/hooks/useLivePrices';

interface ClosedTrade {
  strategy: string | null;
  exit_reason: string | null;
  pnl: number | null;
  closed_at: string | null;
}

interface OpenPosition {
  symbol: string;
  side: string;
  quantity: number;
  avg_entry_price: number;
  strategy: string | null;
}

interface Bucket {
  bucket: string;
  isManual: boolean;
  closedSample: number;
  closedWins: number;
  closedNet: number;
  avgWin: number;
  avgLoss: number;
  recentSample: number;
  recentExpectancy: number;
  openCount: number;
  openPnl: number;
  liveSample: number;
  liveWinRate: number;
  liveExpectancy: number;
}

interface Props {
  isPaper: boolean;
}

// Exits the user (or a manual/broker action) caused rather than the engine's own geometry.
const MANUAL_EXITS = ['close_all', 'force_close', 'manual', 'manual_close', 'user_close'];

function isManualTrade(t: { strategy: string | null; exit_reason: string | null }) {
  const reason = (t.exit_reason ?? '').toLowerCase();
  if (MANUAL_EXITS.some(m => reason.includes(m))) return true;
  // Broker-synced / hand-placed fills arrive without a strategy attached.
  return !t.strategy;
}

function bucketName(t: { strategy: string | null; exit_reason: string | null }) {
  if (isManualTrade(t)) return 'manual';
  return (t.strategy ?? 'manual').toLowerCase();
}

/**
 * Expectancy is the only number that says whether trading can make money:
 *   expectancy = (win rate x avg win) - (loss rate x avg loss), fees included.
 *
 * Every closed trade counts — engine trades AND manual/broker-closed ones — so the
 * headline reflects the whole account, not just the bot's own exits.
 */
export function ExpectancyCard({ isPaper }: Props) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [tradesPerDay, setTradesPerDay] = useState(0);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: tradeData }, { data: posData }] = await Promise.all([
      supabase
        .from('trades')
        .select('strategy, exit_reason, pnl, closed_at')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper)
        .eq('status', 'closed')
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: false })
        .limit(2000),
      supabase
        .from('positions')
        .select('symbol, side, quantity, avg_entry_price, strategy')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper),
    ]);

    const closed = (tradeData ?? []) as ClosedTrade[];
    setTrades(closed);
    setOpenPositions((posData ?? []) as OpenPosition[]);

    const closes = closed
      .map(t => new Date(t.closed_at as string).getTime())
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);
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

  // Group closed trades (engine + manual) and blend open positions at live prices.
  const grouped = new Map<string, ClosedTrade[]>();
  for (const t of trades) {
    const key = bucketName(t);
    const list = grouped.get(key);
    if (list) list.push(t); else grouped.set(key, [t]);
  }

  const buckets: Bucket[] = [...grouped.entries()].map(([bucket, list]) => {
    const pnls = list.map(t => Number(t.pnl ?? 0));
    const wins = pnls.filter(p => p > 0);
    const losses = pnls.filter(p => p < 0);
    const closedSample = pnls.length;
    const closedNet = pnls.reduce((s, p) => s + p, 0);
    const avgWin = wins.length ? wins.reduce((s, p) => s + p, 0) / wins.length : 0;
    const avgLoss = losses.length ? losses.reduce((s, p) => s + p, 0) / losses.length : 0;

    // Trades arrive newest-first, so the first 20 are the window the engine's
    // probation check uses — shown so the two views never look contradictory.
    const recent = pnls.slice(0, 20);
    const recentExpectancy = recent.length ? recent.reduce((s, p) => s + p, 0) / recent.length : 0;

    // Open positions belong to a strategy bucket; manual has no open exposure of its own.
    const strategyPositions = bucket === 'manual'
      ? openPositions.filter(p => !p.strategy)
      : openPositions.filter(p => (p.strategy ?? '').toLowerCase() === bucket);

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

    const liveSample = closedSample + openCount;
    const liveWinRate = liveSample > 0 ? ((wins.length + openWins) / liveSample) * 100 : 0;
    const liveExpectancy = liveSample > 0 ? (closedNet + openPnl) / liveSample : 0;

    return {
      bucket,
      isManual: bucket === 'manual',
      closedSample,
      closedWins: wins.length,
      closedNet,
      avgWin,
      avgLoss,
      recentSample: recent.length,
      recentExpectancy,
      openCount,
      openPnl,
      liveSample,
      liveWinRate,
      liveExpectancy,
    };
  }).sort((a, b) => b.liveSample - a.liveSample);

  const totalTrades = buckets.reduce((s, b) => s + b.liveSample, 0);
  const blendedExpectancy = totalTrades > 0
    ? buckets.reduce((s, b) => s + b.liveExpectancy * b.liveSample, 0) / totalTrades
    : 0;
  const dailyProjection = blendedExpectancy * tradesPerDay;
  const positive = blendedExpectancy > 0;
  const openMarked = buckets.reduce((s, b) => s + b.openCount, 0);
  const manualCount = buckets.find(b => b.isManual)?.closedSample ?? 0;

  // Combined (all buckets pooled): win rate, average win/loss amounts, net P&L.
  const allPnls = trades.map(t => Number(t.pnl ?? 0));
  const allWins = allPnls.filter(p => p > 0);
  const allLosses = allPnls.filter(p => p < 0);
  const combinedOpenPnl = buckets.reduce((s, b) => s + b.openPnl, 0);
  const combinedOpenWins = 0; // counted inside buckets; win rate below uses live counts
  const combinedLiveWins = buckets.reduce(
    (s, b) => s + Math.round((b.liveWinRate / 100) * b.liveSample),
    combinedOpenWins,
  );
  const combinedWinRate = totalTrades > 0 ? (combinedLiveWins / totalTrades) * 100 : 0;
  const combinedAvgWin = allWins.length ? allWins.reduce((s, p) => s + p, 0) / allWins.length : 0;
  const combinedAvgLoss = allLosses.length ? allLosses.reduce((s, p) => s + p, 0) / allLosses.length : 0;
  const combinedNet = allPnls.reduce((s, p) => s + p, 0) + combinedOpenPnl;


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
              All closed trades incl. manual, marked to live prices ({isPaper ? 'paper' : 'live'})
              {openMarked > 0 && ` · ${openMarked} open marked`}
              {manualCount > 0 && ` · ${manualCount} manual`}
              {updatedAt && ` · ${updatedAt.toLocaleTimeString()}`}
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
          No closed trades yet. Expectancy appears once trades have completed.
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

          {/* Combined across every strategy and manual trade */}
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground">Combined — all trades</p>
              <span className="font-mono text-[11px] text-muted-foreground">{totalTrades} trades</span>
            </div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-3 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-muted-foreground">Win rate</p>
                <p className="font-mono text-sm font-semibold text-foreground">
                  {combinedWinRate.toFixed(1)}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {combinedLiveWins}W / {Math.max(totalTrades - combinedLiveWins, 0)}L
                </p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Avg win</p>
                <p className="font-mono text-sm font-semibold text-success">
                  +${combinedAvgWin.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">{allWins.length} wins</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Avg loss</p>
                <p className="font-mono text-sm font-semibold text-destructive">
                  -${Math.abs(combinedAvgLoss).toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">{allLosses.length} losses</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Net P&amp;L</p>
                <p className={cn(
                  'font-mono text-sm font-semibold',
                  combinedNet >= 0 ? 'text-success' : 'text-destructive',
                )}>
                  {combinedNet >= 0 ? '+' : '-'}${Math.abs(combinedNet).toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  incl. {combinedOpenPnl >= 0 ? '+' : '-'}${Math.abs(combinedOpenPnl).toFixed(2)} open
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">

            {buckets.map(b => {
              const exp = b.liveExpectancy;
              const ok = exp > 0;
              return (
                <div key={b.bucket} className="flex flex-col gap-1.5 text-xs py-2.5 border-t border-border/40 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-foreground capitalize truncate">{b.bucket}</span>
                    {b.isManual ? (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                        manual / synced
                      </span>
                    ) : (
                      <span className={cn(
                        'shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium',
                        b.recentExpectancy > 0 ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning',
                      )}>
                        {b.recentExpectancy > 0 ? 'trading' : 'probation'}
                      </span>
                    )}
                    {b.openCount > 0 && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/15 text-primary">
                        {b.openCount} live
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground sm:text-xs sm:gap-4">
                    <span>{b.liveSample} n</span>
                    <span>{b.liveWinRate.toFixed(0)}% WR</span>
                    <span>W ${b.avgWin.toFixed(2)}</span>
                    <span>L ${Math.abs(b.avgLoss).toFixed(2)}</span>
                    {b.openCount > 0 && (
                      <span className={cn('whitespace-nowrap', b.openPnl >= 0 ? 'text-success' : 'text-destructive')}>
                        open {b.openPnl >= 0 ? '+' : '-'}${Math.abs(b.openPnl).toFixed(2)}
                      </span>
                    )}
                    <span className={cn('whitespace-nowrap', ok ? 'text-success' : 'text-destructive')}>
                      {exp >= 0 ? '+' : '-'}${Math.abs(exp).toFixed(2)}/trade
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Rows use your full closed history; the trading / probation badge uses each strategy's
            last 20 exits, the same window the engine checks before sizing.
          </p>

          {!positive && (
            <p className="mt-2 text-xs text-warning">
              Negative expectancy overall: strategies on probation trade one slot at half size until the
              math recovers. More trading at negative expectancy loses more money.
            </p>
          )}
        </>
      )}
    </div>
  );
}

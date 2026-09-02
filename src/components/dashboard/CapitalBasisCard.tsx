import { useState, useEffect, useCallback } from 'react';
import { Coins, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface CapitalStats {
  brokerBalance: number;
  startingCapital: number;
  realizedPnl: number;
  closedTrades: number;
  avgPositionSize: number;
  hasBroker: boolean;
}

/**
 * Live capital reality check.
 *
 * Dollar P&L is meaningless without the capital that produced it: +$1.75 on a $3.60
 * stake is a 49% return, while the same figure on $10,000 would be a rounding error.
 * This card states the base so live results can be read honestly.
 */
export function CapitalBasisCard({ isLiveMode }: { isLiveMode: boolean }) {
  const { user } = useAuth();
  const [stats, setStats] = useState<CapitalStats | null>(null);

  const fetchStats = useCallback(async () => {
    if (!user) return;

    const [accountsRes, settingsRes, tradesRes] = await Promise.all([
      supabase.from('live_account').select('balance, equity').eq('user_id', user.id),
      supabase.from('ai_settings').select('live_initial_investment').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('trades')
        .select('pnl, quantity, entry_price')
        .eq('user_id', user.id)
        .eq('is_paper', false)
        .eq('status', 'closed'),
    ]);

    const accounts = accountsRes.data ?? [];
    const trades = tradesRes.data ?? [];

    const brokerBalance = accounts.reduce((sum, a) => sum + Number(a.equity || a.balance || 0), 0);
    const realizedPnl = trades.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
    const notionals = trades.map(t => Number(t.quantity || 0) * Number(t.entry_price || 0)).filter(n => n > 0);
    const avgPositionSize = notionals.length
      ? notionals.reduce((a, b) => a + b, 0) / notionals.length
      : 0;

    setStats({
      brokerBalance,
      startingCapital: Number(settingsRes.data?.live_initial_investment || 0),
      realizedPnl,
      closedTrades: trades.length,
      avgPositionSize,
      hasBroker: accounts.length > 0,
    });
  }, [user]);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 30000);
    return () => clearInterval(id);
  }, [fetchStats]);

  if (!isLiveMode || !stats) return null;

  const { brokerBalance, startingCapital, realizedPnl, closedTrades, avgPositionSize, hasBroker } = stats;
  const returnPct = startingCapital > 0 ? (realizedPnl / startingCapital) * 100 : 0;
  const isMicroCapital = startingCapital > 0 && startingCapital < 100;

  const money = (n: number) =>
    `$${n.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: n > 0 && n < 0.01 ? 6 : 2,
    })}`;

  return (
    <div className="glass-panel p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Coins className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-medium text-foreground">Live Capital Basis</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-secondary/30">
          <p className="text-xs text-muted-foreground mb-1">Starting capital</p>
          <p className="text-base font-bold text-foreground">{money(startingCapital)}</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <p className="text-xs text-muted-foreground mb-1">Broker balance now</p>
          <p className="text-base font-bold text-foreground">{money(brokerBalance)}</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <p className="text-xs text-muted-foreground mb-1">Realized P&amp;L</p>
          <p className={cn('text-base font-bold', realizedPnl >= 0 ? 'text-success' : 'text-loss')}>
            {realizedPnl >= 0 ? '+' : ''}{money(realizedPnl)}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}% on capital · {closedTrades} trades
          </p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30">
          <p className="text-xs text-muted-foreground mb-1">Avg position size</p>
          <p className="text-base font-bold text-foreground">{money(avgPositionSize)}</p>
        </div>
      </div>

      {!hasBroker && (
        <p className="mt-3 text-xs text-muted-foreground">
          No broker connected — live trades are skipped until you connect one in API Keys.
        </p>
      )}

      {isMicroCapital && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-warning-foreground/90">
            Percentage returns here are real, but the dollar amounts are bounded by{' '}
            {money(startingCapital)} of capital. Positions average {money(avgPositionSize)}, so a
            winning trade can only ever return cents. Funding the account is what turns the same
            percentages into meaningful dollars.
          </p>
        </div>
      )}
    </div>
  );
}

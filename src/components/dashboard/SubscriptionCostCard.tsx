import { useEffect, useState } from 'react';
import { Receipt, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { MONTHLY_PRICE_USD } from '@/lib/pricing';
import { cn } from '@/lib/utils';

const fmt = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/**
 * Monthly accounting view: realized trading P&L this calendar month,
 * minus the subscription fee, so the user sees true net.
 */
export function SubscriptionCostCard() {
  const { user } = useAuth();
  const { subscribed, isFreeAccess } = useSubscription();
  const [realized, setRealized] = useState<number | null>(null);

  // Fee is zero for invited/admin accounts and while not subscribed
  const fee = subscribed && !isFreeAccess ? MONTHLY_PRICE_USD : 0;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data } = await supabase
        .from('trades')
        .select('pnl')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', monthStart);

      if (cancelled) return;
      const sum = (data || []).reduce((acc, t) => acc + Number(t.pnl || 0), 0);
      setRealized(sum);
    };

    load();
    const interval = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user]);

  const net = (realized ?? 0) - fee;
  const isProfit = net > 0;
  const isFlat = net === 0;
  const monthLabel = new Date().toLocaleString('en-US', { month: 'long' });

  return (
    <div className="glass-panel p-5 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">
            {monthLabel} Net (after fees)
          </h3>
        </div>
        {isFlat ? (
          <Minus className="w-4 h-4 text-muted-foreground" />
        ) : isProfit ? (
          <TrendingUp className="w-4 h-4 text-profit" />
        ) : (
          <TrendingDown className="w-4 h-4 text-loss" />
        )}
      </div>

      <p
        className={cn(
          'text-2xl font-bold tabular-nums mb-4',
          isFlat ? 'text-foreground' : isProfit ? 'text-profit' : 'text-loss'
        )}
      >
        {realized === null ? '—' : fmt(net)}
      </p>

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Realized trading P&L</span>
          <span
            className={cn(
              'tabular-nums font-medium',
              (realized ?? 0) >= 0 ? 'text-profit' : 'text-loss'
            )}
          >
            {realized === null ? '—' : fmt(realized)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subscription fee</span>
          <span className="tabular-nums font-medium text-foreground">
            {fee === 0 ? 'Free' : `-${fmt(fee).replace('-', '')}`}
          </span>
        </div>
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-muted-foreground">Break-even needed</span>
          <span className="tabular-nums font-medium text-foreground">{fmt(fee)}</span>
        </div>
      </div>

      {realized !== null && fee > 0 && realized > 0 && realized < fee && (
        <p className="text-xs text-muted-foreground mt-3">
          You're profitable on trades but {fmt(fee - realized)} short of covering the fee this month.
        </p>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  strategy: string | null;
  status: 'open' | 'closed' | 'cancelled';
  marketType: 'stocks' | 'crypto';
  isPaper: boolean;
  createdAt: Date;
  closedAt: Date | null;
  aiReasoning: string | null;
}

export function useRecentTrades(isPaper: boolean = true, limit: number = 4) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrades = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const formattedTrades: Trade[] = (data || []).map(trade => ({
        id: trade.id,
        symbol: trade.symbol,
        side: trade.side as 'buy' | 'sell',
        quantity: Number(trade.quantity),
        entryPrice: Number(trade.entry_price),
        exitPrice: trade.exit_price ? Number(trade.exit_price) : null,
        pnl: trade.pnl ? Number(trade.pnl) : null,
        strategy: trade.strategy,
        status: trade.status as 'open' | 'closed' | 'cancelled',
        marketType: trade.market_type as 'stocks' | 'crypto',
        isPaper: trade.is_paper,
        createdAt: new Date(trade.created_at || ''),
        closedAt: trade.closed_at ? new Date(trade.closed_at) : null,
        aiReasoning: trade.ai_reasoning,
      }));

      setTrades(formattedTrades);
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isPaper, limit]);

  useEffect(() => {
    fetchTrades();

    // Auto-refresh every 10 seconds
    const intervalId = setInterval(fetchTrades, 10000);

    const channel = supabase
      .channel(`trades-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        () => {
          fetchTrades();
        }
      )
      .subscribe();

    // Refresh on visibility/focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchTrades();
    };
    const handleFocus = () => fetchTrades();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      supabase.removeChannel(channel);
    };
  }, [fetchTrades]);

  return { trades, isLoading, refetch: fetchTrades };
}

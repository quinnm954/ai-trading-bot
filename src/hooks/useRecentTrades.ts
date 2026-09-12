import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchCoinbasePrices } from '@/lib/coinbasePrices';

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
  marketType: 'crypto';
  isPaper: boolean;
  createdAt: Date;
  closedAt: Date | null;
  aiReasoning: string | null;
  /** Live mark price for open trades */
  currentPrice?: number | null;
  /** P&L as a percent of cost basis */
  pnlPercent?: number | null;
}

export function useRecentTrades(isPaper: boolean = true, limit: number = 4, sinceHours: number = 24) {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTrades = useCallback(async () => {
    if (!user) return;

    try {
      const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

      const [closedRes, openRes] = await Promise.all([
        supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_paper', isPaper)
          .eq('status', 'closed')
          .gte('closed_at', sinceIso)
          .order('closed_at', { ascending: false })
          .limit(limit),
        supabase
          .from('trades')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_paper', isPaper)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(limit),
      ]);

      if (closedRes.error) throw closedRes.error;
      if (openRes.error) throw openRes.error;

      const openRows = openRes.data || [];
      // Live marks so open trades show real running profit, not $0.00
      const livePrices = openRows.length
        ? await fetchCoinbasePrices([...new Set(openRows.map(t => t.symbol))])
        : {};

      const map = (trade: any): Trade => {
        const quantity = Number(trade.quantity);
        const entryPrice = Number(trade.entry_price);
        const isOpen = trade.status === 'open';
        const livePrice = isOpen
          ? livePrices[String(trade.symbol).toUpperCase()] ?? null
          : null;

        let pnl = trade.pnl != null ? Number(trade.pnl) : null;
        if (isOpen && livePrice != null && entryPrice > 0) {
          pnl = trade.side === 'sell'
            ? (entryPrice - livePrice) * quantity
            : (livePrice - entryPrice) * quantity;
        }

        const costBasis = entryPrice * quantity;
        return {
          id: trade.id,
          symbol: trade.symbol,
          side: trade.side as 'buy' | 'sell',
          quantity,
          entryPrice,
          exitPrice: trade.exit_price ? Number(trade.exit_price) : null,
          pnl,
          strategy: trade.strategy,
          status: trade.status as 'open' | 'closed' | 'cancelled',
          marketType: trade.market_type as 'crypto',
          isPaper: trade.is_paper,
          createdAt: new Date(trade.created_at || ''),
          closedAt: trade.closed_at ? new Date(trade.closed_at) : null,
          aiReasoning: trade.ai_reasoning,
          currentPrice: livePrice,
          pnlPercent: pnl != null && costBasis > 0 ? (pnl / costBasis) * 100 : null,
        };
      };

      // Open trades first (live P&L), then recent closes
      const formattedTrades: Trade[] = [
        ...openRows.map(map),
        ...(closedRes.data || []).map(map),
      ].slice(0, limit);

      setTrades(formattedTrades);
    } catch (error) {
      console.error('Error fetching trades:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isPaper, limit, sinceHours]);

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

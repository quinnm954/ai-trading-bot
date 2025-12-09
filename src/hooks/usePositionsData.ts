import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Position {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  strategy: string | null;
  marketType: 'stocks' | 'crypto';
  isPaper: boolean;
  createdAt: Date;
}

export function usePositionsData(isPaper: boolean = true) {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPositions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper);

      if (error) throw error;

      const formattedPositions: Position[] = (data || []).map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        side: pos.side as 'buy' | 'sell',
        quantity: Number(pos.quantity),
        avgEntryPrice: Number(pos.avg_entry_price),
        currentPrice: pos.current_price ? Number(pos.current_price) : null,
        unrealizedPnl: pos.unrealized_pnl ? Number(pos.unrealized_pnl) : null,
        strategy: pos.strategy,
        marketType: pos.market_type as 'stocks' | 'crypto',
        isPaper: pos.is_paper,
        createdAt: new Date(pos.created_at || ''),
      }));

      setPositions(formattedPositions);
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isPaper]);

  useEffect(() => {
    fetchPositions();

    const channel = supabase
      .channel('positions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPositions]);

  return { positions, isLoading, refetch: fetchPositions };
}

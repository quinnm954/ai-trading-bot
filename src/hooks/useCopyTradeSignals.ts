import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CopyTradeSignal {
  id: string;
  trader_id: string;
  symbol: string;
  action: string;
  entry_price: number;
  quantity: number;
  trade_value_usd: number;
  status: string;
  created_at: string;
  copied_at: string | null;
  trader?: {
    display_name: string;
    win_rate: number;
    trading_style: string;
  };
}

export function useCopyTradeSignals() {
  const { user } = useAuth();
  const [realtimeSignals, setRealtimeSignals] = useState<CopyTradeSignal[]>([]);

  // Fetch signals from followed traders
  const { data: signals, isLoading, refetch } = useQuery({
    queryKey: ['copy-trade-signals', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get followed trader IDs
      const { data: followed } = await supabase
        .from('followed_traders')
        .select('trader_id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (!followed || followed.length === 0) return [];

      const traderIds = followed.map(f => f.trader_id);

      // Get recent signals from these traders
      const { data, error } = await supabase
        .from('copy_trade_signals')
        .select(`
          *,
          top_traders!copy_trade_signals_trader_id_fkey (
            display_name,
            win_rate,
            trading_style
          )
        `)
        .in('trader_id', traderIds)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      return (data || []).map((s: any) => ({
        ...s,
        trader: s.top_traders,
      }));
    },
    enabled: !!user?.id,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  // Real-time subscription for new signals
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`copy-trade-signals-realtime-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'copy_trade_signals',
        },
        async (payload) => {
          console.log('📊 New copy trade signal received:', payload.new);
          
          // Check if this is from a followed trader
          const { data: isFollowed } = await supabase
            .from('followed_traders')
            .select('id')
            .eq('user_id', user.id)
            .eq('trader_id', payload.new.trader_id)
            .eq('is_active', true)
            .single();

          if (isFollowed) {
            // Get trader info
            const { data: trader } = await supabase
              .from('top_traders')
              .select('display_name, win_rate, trading_style')
              .eq('id', payload.new.trader_id)
              .single();

            const newSignal: CopyTradeSignal = {
              ...payload.new as any,
              trader: trader || undefined,
            };

            setRealtimeSignals(prev => [newSignal, ...prev.slice(0, 9)]);
            refetch();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, refetch]);

  // Trigger copy trade executor
  const executeCopyTrades = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('copy-trade-executor');
      if (error) throw error;
      refetch();
      return data;
    } catch (err) {
      console.error('Failed to execute copy trades:', err);
      throw err;
    }
  };

  // Combine query signals with realtime signals (dedupe)
  const allSignals = [...(realtimeSignals || []), ...(signals || [])].filter(
    (signal, index, self) => index === self.findIndex(s => s.id === signal.id)
  );

  return {
    signals: allSignals,
    isLoading,
    executeCopyTrades,
    refetch,
  };
}

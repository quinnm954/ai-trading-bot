import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  status: 'open' | 'closed' | 'cancelled';
  pnl: number | null;
  strategy: string | null;
  aiReason: string | null;
  marketType: 'stocks' | 'crypto';
  isPaper: boolean;
  createdAt: Date;
  closedAt: Date | null;
}

interface Position {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  strategy: string | null;
  marketType: 'stocks' | 'crypto';
  isPaper: boolean;
  createdAt: Date;
}

export function useTradesData() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tradingMode, setTradingMode] = useState<'paper' | 'live'>('paper');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const strategyDisplayName: Record<string, string> = {
    rsi: 'RSI Strategy',
    ema_crossover: 'EMA Crossover',
    macd: 'MACD Momentum',
    trend_breakout: 'Trend Breakout',
    volatility_breakout: 'Volatility Breakout',
    grid: 'Grid Bot',
    dca: 'DCA Bot',
    custom: 'Custom Strategy',
  };

  const fetchData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Get trading mode
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('trading_mode')
        .eq('user_id', user.id)
        .maybeSingle();

      const mode = (aiSettings?.trading_mode as 'paper' | 'live') || 'paper';
      setTradingMode(mode);

      // Fetch closed trades
      const { data: tradesData, error: tradesError } = await supabase
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_paper', mode === 'paper')
        .order('created_at', { ascending: false });

      if (tradesError) {
        console.error('Error fetching trades:', tradesError);
      } else if (tradesData) {
        setTrades(tradesData.map(t => ({
          id: t.id,
          symbol: t.symbol,
          side: t.side as 'buy' | 'sell',
          quantity: Number(t.quantity),
          entryPrice: Number(t.entry_price),
          exitPrice: t.exit_price ? Number(t.exit_price) : null,
          status: t.status as 'open' | 'closed' | 'cancelled',
          pnl: t.pnl ? Number(t.pnl) : null,
          strategy: t.strategy ? strategyDisplayName[t.strategy] || t.strategy : null,
          aiReason: t.ai_reasoning,
          marketType: t.market_type as 'stocks' | 'crypto',
          isPaper: t.is_paper,
          createdAt: new Date(t.created_at!),
          closedAt: t.closed_at ? new Date(t.closed_at) : null,
        })));
      }

      // Fetch open positions
      const { data: positionsData, error: positionsError } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_paper', mode === 'paper')
        .order('created_at', { ascending: false });

      if (positionsError) {
        console.error('Error fetching positions:', positionsError);
      } else if (positionsData) {
        setPositions(positionsData.map(p => ({
          id: p.id,
          symbol: p.symbol,
          side: p.side as 'buy' | 'sell',
          quantity: Number(p.quantity),
          entryPrice: Number(p.avg_entry_price),
          currentPrice: p.current_price ? Number(p.current_price) : null,
          unrealizedPnl: p.unrealized_pnl ? Number(p.unrealized_pnl) : null,
          strategy: p.strategy ? strategyDisplayName[p.strategy] || p.strategy : null,
          marketType: p.market_type as 'stocks' | 'crypto',
          isPaper: p.is_paper,
          createdAt: new Date(p.created_at!),
        })));
      }
    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setIsLoading(false);
      setLastUpdated(new Date());
    }
  }, [user]);

  useEffect(() => {
    fetchData();

    // Subscribe to real-time trades updates
    const tradesChannel = supabase
      .channel('trades-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        (payload) => {
          console.log('Trades update:', payload);
          fetchData();
        }
      )
      .subscribe();

    // Subscribe to real-time positions updates
    const positionsChannel = supabase
      .channel('positions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
        },
        (payload) => {
          console.log('Positions update:', payload);
          fetchData();
        }
      )
      .subscribe();

    // Auto-refresh every 30 seconds as backup
    const intervalId = setInterval(() => {
      fetchData();
    }, 30000);

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(positionsChannel);
    };
  }, [fetchData]);

  // Calculate P&L stats
  const closedTrades = trades.filter(t => t.status === 'closed');
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  const todayTrades = closedTrades.filter(t => t.closedAt && t.closedAt >= todayStart);
  const dailyPnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weeklyTrades = closedTrades.filter(t => t.closedAt && t.closedAt >= weekStart);
  const weeklyPnl = weeklyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const winningTrades = closedTrades.filter(t => t.pnl && t.pnl > 0);
  const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

  return {
    trades,
    positions,
    isLoading,
    tradingMode,
    lastUpdated,
    stats: {
      totalTrades: closedTrades.length,
      openPositions: positions.length,
      todayTrades: todayTrades.length,
      dailyPnl,
      weeklyPnl,
      totalPnl,
      winRate,
    },
    refetch: fetchData,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DashboardStats {
  cashBalance: number;
  positionsValue: number;
  totalEquity: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  weeklyPnl: number;
  weeklyPnlPercent: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  todayTrades: number;
  tradingMode: 'paper' | 'live';
}

interface LiveAccount {
  provider: string;
  balance: number;
  equity: number;
  buyingPower: number;
  lastSynced: Date | null;
}

export function useDashboardData() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    cashBalance: 0,
    positionsValue: 0,
    totalEquity: 0,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    weeklyPnl: 0,
    weeklyPnlPercent: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    openPositions: 0,
    todayTrades: 0,
    tradingMode: 'paper',
  });
  const [liveAccounts, setLiveAccounts] = useState<LiveAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRealtimeUpdate, setIsRealtimeUpdate] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      // Fetch AI settings for trading mode
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('trading_mode')
        .eq('user_id', user.id)
        .maybeSingle();

      const tradingMode = (aiSettings?.trading_mode as 'paper' | 'live') || 'paper';

      // Fetch paper account
      const { data: paperAccount } = await supabase
        .from('paper_account')
        .select('balance, initial_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      const initialBalance = paperAccount?.initial_balance || 100000;

      // Fetch live accounts
      const { data: liveAccountsData } = await supabase
        .from('live_account')
        .select('*')
        .eq('user_id', user.id);

      const formattedLiveAccounts: LiveAccount[] = (liveAccountsData || []).map(acc => ({
        provider: acc.provider,
        balance: acc.balance,
        equity: acc.equity,
        buyingPower: acc.buying_power,
        lastSynced: acc.last_synced_at ? new Date(acc.last_synced_at) : null,
      }));

      setLiveAccounts(formattedLiveAccounts);

      // Fetch positions and calculate value
      const { data: positionsData, count: positionsCount } = await supabase
        .from('positions')
        .select('quantity, avg_entry_price, current_price', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_paper', tradingMode === 'paper');

      // Calculate total positions value
      let positionsValue = 0;
      if (positionsData) {
        positionsValue = positionsData.reduce((sum, pos) => {
          const price = pos.current_price || pos.avg_entry_price;
          return sum + (Number(pos.quantity) * Number(price));
        }, 0);
      }

      // Fetch today's trades and calculate P&L
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      
      const { data: allTrades } = await supabase
        .from('trades')
        .select('pnl, closed_at, created_at')
        .eq('user_id', user.id)
        .eq('is_paper', tradingMode === 'paper')
        .eq('status', 'closed');

      // Calculate P&L from trades
      let dailyPnl = 0;
      let weeklyPnl = 0;
      let totalPnl = 0;
      let todayTradesCount = 0;

      if (allTrades) {
        allTrades.forEach(trade => {
          const pnl = Number(trade.pnl) || 0;
          const closedAt = trade.closed_at ? new Date(trade.closed_at) : null;
          
          totalPnl += pnl;
          
          if (closedAt) {
            if (closedAt >= today) {
              dailyPnl += pnl;
              todayTradesCount++;
            }
            if (closedAt >= weekStart) {
              weeklyPnl += pnl;
            }
          }
        });
      }

      // Calculate cash balance based on mode
      let cashBalance = paperAccount?.balance || 100000;
      
      if (tradingMode === 'live' && formattedLiveAccounts.length > 0) {
        cashBalance = formattedLiveAccounts.reduce((sum, acc) => sum + acc.balance, 0);
      }

      // Total equity = cash + positions value
      const totalEquity = cashBalance + positionsValue;

      // Calculate percentages based on total equity
      const dailyPnlPercent = totalEquity > 0 ? (dailyPnl / totalEquity) * 100 : 0;
      const weeklyPnlPercent = totalEquity > 0 ? (weeklyPnl / totalEquity) * 100 : 0;
      const totalPnlPercent = initialBalance > 0 ? ((totalEquity - initialBalance) / initialBalance) * 100 : 0;

      setStats({
        cashBalance,
        positionsValue,
        totalEquity,
        dailyPnl,
        dailyPnlPercent,
        weeklyPnl,
        weeklyPnlPercent,
        totalPnl,
        totalPnlPercent,
        openPositions: positionsCount || 0,
        todayTrades: todayTradesCount,
        tradingMode,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
      setLastUpdated(new Date());
    }
  }, [user]);

  // Trigger pulse animation
  const triggerRealtimeUpdate = useCallback(() => {
    setIsRealtimeUpdate(true);
    setTimeout(() => setIsRealtimeUpdate(false), 1500);
  }, []);

  useEffect(() => {
    fetchData();
    
    // Subscribe to real-time trades updates
    const tradesChannel = supabase
      .channel('dashboard-trades-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trades',
        },
        () => {
          triggerRealtimeUpdate();
          fetchData();
        }
      )
      .subscribe();

    // Subscribe to real-time positions updates
    const positionsChannel = supabase
      .channel('dashboard-positions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
        },
        () => {
          triggerRealtimeUpdate();
          fetchData();
        }
      )
      .subscribe();

    // Subscribe to real-time paper account updates
    const paperChannel = supabase
      .channel('dashboard-paper-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'paper_account',
        },
        () => {
          triggerRealtimeUpdate();
          fetchData();
        }
      )
      .subscribe();

    // Auto-refresh every 3 seconds for faster live trading updates
    const intervalId = setInterval(() => {
      fetchData();
    }, 3000);
    
    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(paperChannel);
    };
  }, [fetchData, triggerRealtimeUpdate]);

  return {
    stats,
    liveAccounts,
    isLoading,
    lastUpdated,
    isRealtimeUpdate,
    refetch: fetchData,
  };
}

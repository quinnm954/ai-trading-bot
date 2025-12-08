import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DashboardStats {
  totalBalance: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  weeklyPnl: number;
  weeklyPnlPercent: number;
  totalPnl: number;
  totalPnlPercent: number;
  equity: number;
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
    totalBalance: 0,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    weeklyPnl: 0,
    weeklyPnlPercent: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    equity: 0,
    openPositions: 0,
    todayTrades: 0,
    tradingMode: 'paper',
  });
  const [liveAccounts, setLiveAccounts] = useState<LiveAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

      // Fetch positions count
      const { count: positionsCount } = await supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_paper', tradingMode === 'paper');

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

      // Calculate balance based on mode
      let totalBalance = paperAccount?.balance || 100000;
      
      if (tradingMode === 'live' && formattedLiveAccounts.length > 0) {
        totalBalance = formattedLiveAccounts.reduce((sum, acc) => sum + acc.equity, 0);
      }

      // Calculate percentages
      const dailyPnlPercent = totalBalance > 0 ? (dailyPnl / totalBalance) * 100 : 0;
      const weeklyPnlPercent = totalBalance > 0 ? (weeklyPnl / totalBalance) * 100 : 0;
      const totalPnlPercent = initialBalance > 0 ? ((totalBalance - initialBalance) / initialBalance) * 100 : 0;

      setStats({
        totalBalance,
        dailyPnl,
        dailyPnlPercent,
        weeklyPnl,
        weeklyPnlPercent,
        totalPnl,
        totalPnlPercent,
        equity: totalBalance,
        openPositions: positionsCount || 0,
        todayTrades: todayTradesCount,
        tradingMode,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    stats,
    liveAccounts,
    isLoading,
    refetch: fetchData,
  };
}

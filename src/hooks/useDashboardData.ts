import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface DashboardStats {
  totalBalance: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  weeklyPnlPercent: number;
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
    weeklyPnlPercent: 0,
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
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

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

      // Fetch today's trades count
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: todayTradesCount } = await supabase
        .from('trades')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_paper', tradingMode === 'paper')
        .gte('created_at', today.toISOString());

      // Calculate balance based on mode
      let totalBalance = paperAccount?.balance || 100000;
      
      if (tradingMode === 'live' && formattedLiveAccounts.length > 0) {
        totalBalance = formattedLiveAccounts.reduce((sum, acc) => sum + acc.equity, 0);
      }

      setStats({
        totalBalance,
        dailyPnl: 0, // Will be calculated from trades
        dailyPnlPercent: 0,
        weeklyPnlPercent: 0,
        equity: totalBalance,
        openPositions: positionsCount || 0,
        todayTrades: todayTradesCount || 0,
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

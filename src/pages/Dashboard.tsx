import { 
  Wallet, 
  TrendingUp, 
  Target, 
  Activity,
  Banknote,
  RefreshCw,
  PieChart,
  DollarSign,
  Trash2
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { EquityChart } from '@/components/dashboard/EquityChart';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { AIStatusCard } from '@/components/dashboard/AIStatusCard';
import { MarketTicker } from '@/components/dashboard/MarketTicker';
import { RecentTradesCard } from '@/components/dashboard/RecentTradesCard';
import { MarketRegimeCard } from '@/components/dashboard/MarketRegimeCard';
import { SafetyStatusCard } from '@/components/dashboard/SafetyStatusCard';
import { MilestoneProgressCard } from '@/components/dashboard/MilestoneProgressCard';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function Dashboard() {
  const { stats, liveAccounts, isLoading, refetch, lastUpdated } = useDashboardData();
  const isLiveMode = stats.tradingMode === 'live';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const { toast } = useToast();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleSellAll = async () => {
    if (!confirm('Are you sure you want to sell ALL crypto holdings?')) return;
    
    setIsSelling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Not authenticated', variant: 'destructive' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-take-profit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'sell-all' }),
        }
      );

      const result = await response.json();
      
      if (result.sold?.length > 0) {
        const totalValue = result.sold.reduce((sum: number, s: any) => sum + (s.usdValue || 0), 0);
        toast({
          title: '🔥 Sold All Holdings',
          description: `Liquidated ${result.sold.length} positions for $${totalValue.toFixed(2)}`,
        });
        refetch();
      } else if (result.errors?.length > 0) {
        toast({ title: 'Some sells failed', description: result.errors[0], variant: 'destructive' });
      } else {
        toast({ title: 'No holdings to sell' });
      }
    } catch (error) {
      toast({ title: 'Sell failed', variant: 'destructive' });
    } finally {
      setIsSelling(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header with Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isLiveMode && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleSellAll}
              disabled={isSelling}
              className="gap-2"
            >
              <Trash2 className={`w-4 h-4 ${isSelling ? 'animate-pulse' : ''}`} />
              {isSelling ? 'Selling...' : 'Sell All'}
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>
      {/* Trading Mode Indicator */}
      {isLiveMode && (
        <div className="p-3 rounded-lg bg-loss/10 border border-loss/30 flex items-center gap-3">
          <Banknote className="w-5 h-5 text-loss" />
          <span className="text-sm font-medium text-loss">
            Live Trading Mode — Showing real account balances from connected brokers
          </span>
        </div>
      )}

      {/* Market Ticker */}
      <MarketTicker />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Cash Balance"
          value={isLoading ? '...' : `$${stats.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={Wallet}
          changeLabel="Available to trade"
        />
        <StatCard
          title="Positions Value"
          value={isLoading ? '...' : `$${stats.positionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={PieChart}
          changeLabel={`${stats.openPositions} open positions`}
        />
        <StatCard
          title="Total Equity"
          value={isLoading ? '...' : `$${stats.totalEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          change={stats.totalPnlPercent}
          trend={stats.totalPnlPercent >= 0 ? 'up' : 'down'}
          icon={DollarSign}
        />
        <StatCard
          title="Today's P&L"
          value={`${stats.dailyPnl >= 0 ? '+' : ''}$${stats.dailyPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          change={stats.dailyPnlPercent}
          trend={stats.dailyPnl >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
        />
        <StatCard
          title="Today's Trades"
          value={stats.todayTrades.toString()}
          change={stats.weeklyPnlPercent}
          changeLabel="Weekly performance"
          trend={stats.weeklyPnlPercent >= 0 ? 'up' : 'down'}
          icon={Activity}
        />
      </div>

      {/* Live Accounts Summary (only show in live mode) */}
      {isLiveMode && liveAccounts.length > 0 && (
        <div className="glass-panel p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            <Banknote className="w-4 h-4" />
            Connected Broker Accounts
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {liveAccounts.map((account) => (
              <div 
                key={account.provider} 
                className="p-3 rounded-lg bg-secondary/30 flex items-center justify-between"
              >
                <div>
                  <span className="font-medium text-foreground capitalize">{account.provider}</span>
                  <p className="text-lg font-bold text-foreground">
                    ${account.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
                {account.lastSynced && (
                  <span className="text-xs text-muted-foreground">
                    Synced {account.lastSynced.toLocaleTimeString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Market Regime & Safety Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MarketRegimeCard />
        <SafetyStatusCard />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <MilestoneProgressCard />
          <EquityChart />
          <PositionsTable />
        </div>
        <div className="space-y-6">
          <AIStatusCard />
          <RecentTradesCard />
        </div>
      </div>
    </div>
  );
}

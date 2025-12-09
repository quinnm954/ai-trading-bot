import { 
  Wallet, 
  TrendingUp, 
  Target, 
  Activity,
  Banknote,
  RefreshCw
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { EquityChart } from '@/components/dashboard/EquityChart';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { AIStatusCard } from '@/components/dashboard/AIStatusCard';
import { MarketTicker } from '@/components/dashboard/MarketTicker';
import { RecentTradesCard } from '@/components/dashboard/RecentTradesCard';
import { MarketRegimeCard } from '@/components/dashboard/MarketRegimeCard';
import { SafetyStatusCard } from '@/components/dashboard/SafetyStatusCard';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function Dashboard() {
  const { stats, liveAccounts, isLoading, refetch, lastUpdated } = useDashboardData();
  const isLiveMode = stats.tradingMode === 'live';
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={isLiveMode ? "Live Balance" : "Paper Balance"}
          value={isLoading ? '...' : `$${stats.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          change={stats.dailyPnlPercent}
          trend={stats.dailyPnl >= 0 ? 'up' : 'down'}
          icon={isLiveMode ? Banknote : Wallet}
        />
        <StatCard
          title="Today's P&L"
          value={`${stats.dailyPnl >= 0 ? '+' : ''}$${stats.dailyPnl.toLocaleString()}`}
          change={stats.dailyPnlPercent}
          trend={stats.dailyPnl >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
        />
        <StatCard
          title="Open Positions"
          value={stats.openPositions.toString()}
          changeLabel={`$${stats.equity.toLocaleString()} in equity`}
          icon={Target}
        />
        <StatCard
          title="Today's Trades"
          value={stats.todayTrades.toString()}
          change={stats.weeklyPnlPercent}
          changeLabel="Weekly performance"
          trend="up"
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

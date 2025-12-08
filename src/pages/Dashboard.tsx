import { 
  Wallet, 
  TrendingUp, 
  Target, 
  Activity,
  BarChart3,
  Layers
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { EquityChart } from '@/components/dashboard/EquityChart';
import { PositionsTable } from '@/components/dashboard/PositionsTable';
import { AIStatusCard } from '@/components/dashboard/AIStatusCard';
import { MarketTicker } from '@/components/dashboard/MarketTicker';
import { RecentTradesCard } from '@/components/dashboard/RecentTradesCard';
import { mockPortfolioStats } from '@/lib/mockData';

export default function Dashboard() {
  const stats = mockPortfolioStats;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Market Ticker */}
      <MarketTicker />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Balance"
          value={`$${stats.totalBalance.toLocaleString()}`}
          change={stats.totalPnlPercent}
          trend="up"
          icon={Wallet}
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

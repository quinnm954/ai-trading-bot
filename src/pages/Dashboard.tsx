import { 
  Wallet, 
  TrendingUp, 
  Target, 
  Activity,
  Banknote,
  RefreshCw,
  PieChart,
  DollarSign,
  Trash2,
  RotateCcw
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
import { DailyAuditCard } from '@/components/dashboard/DailyAuditCard';
import { AICreditsMeter } from '@/components/dashboard/AICreditsMeter';
import { ScalpingStatsRow } from '@/components/dashboard/ScalpingStatsRow';
import { AIDecisionsBreakdownCard } from '@/components/dashboard/AIDecisionsBreakdownCard';
import { PaperTradingOnboarding } from '@/components/onboarding/PaperTradingOnboarding';
import { MemeCoinsOnlyToggle } from '@/components/trading/MemeCoinsOnlyToggle';
import { TrialDaysIndicator } from '@/components/dashboard/TrialDaysIndicator';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function Dashboard() {
  const { stats, positions, liveAccounts, isLoading, refetch, lastUpdated } = useDashboardData();
  const isLiveMode = stats.tradingMode === 'live';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSelling, setIsSelling] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isClosingPaper, setIsClosingPaper] = useState(false);
  const [clearHistory, setClearHistory] = useState(true);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleClosePaperPositions = async () => {
    if (!confirm('Close ALL open paper positions at current market price?')) return;
    setIsClosingPaper(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Not authenticated', variant: 'destructive' });
        return;
      }
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/close-all-paper-positions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );
      const result = await res.json();
      if (result.success) {
        toast({
          title: `✅ Closed ${result.closed} positions`,
          description: `Proceeds: $${Number(result.totalProceeds || 0).toFixed(2)} · Realized P&L: $${Number(result.totalPnl || 0).toFixed(2)}`,
        });
        refetch();
      } else {
        toast({ title: 'Close failed', description: result.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (e: unknown) {
      toast({ title: 'Close failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsClosingPaper(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    // If in live mode, sync broker balances first
    if (isLiveMode) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-broker-balances`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
            }
          );
        }
      } catch (error) {
        console.error('Sync error:', error);
      }
    }
    
    await refetch();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleResetPaperBalance = async () => {
    setIsResetting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Not authenticated', variant: 'destructive' });
        return;
      }

      // Reset paper account balance to initial $100,000
      const { error: accountError } = await supabase
        .from('paper_account')
        .update({ balance: 100000 })
        .eq('user_id', user.id);

      if (accountError) throw accountError;

      if (clearHistory) {
        // Delete paper trades
        await supabase
          .from('trades')
          .delete()
          .eq('user_id', user.id)
          .eq('is_paper', true);

        // Delete paper positions
        await supabase
          .from('positions')
          .delete()
          .eq('user_id', user.id)
          .eq('is_paper', true);

        // Delete equity history
        await supabase
          .from('equity_history')
          .delete()
          .eq('user_id', user.id);

        // Add fresh equity point
        await supabase
          .from('equity_history')
          .insert({ user_id: user.id, equity: 100000 });

        // Reset AI settings drawdown tracking
        await supabase
          .from('ai_settings')
          .update({
            current_drawdown: 0,
            peak_equity: 100000,
            daily_loss_today: 0,
            weekly_loss_current: 0,
            kill_switch_active: false,
            kill_switch_triggered_at: null,
          })
          .eq('user_id', user.id);

        toast({ title: '✨ Fresh Start!', description: 'Paper balance reset to $100,000 and all history cleared.' });
      } else {
        toast({ title: '💰 Balance Reset', description: 'Paper balance reset to $100,000.' });
      }

      setResetDialogOpen(false);
      refetch();
    } catch (error) {
      console.error('Reset error:', error);
      toast({ title: 'Reset failed', variant: 'destructive' });
    } finally {
      setIsResetting(false);
    }
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
        const totalValue = result.sold.reduce((sum: number, soldPosition: { usdValue?: number }) => sum + (soldPosition.usdValue || 0), 0);
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
    <>
      <PaperTradingOnboarding />
      <div className="space-y-4 lg:space-y-6 animate-fade-in">
      {/* Header with Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl lg:text-2xl font-bold text-foreground">Dashboard</h1>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>
          {/* TrialDaysIndicator hidden — subscriptions disabled during testing */}
        </div>
        <div className="flex gap-2">
          {!isLiveMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClosePaperPositions}
              disabled={isClosingPaper}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">{isClosingPaper ? 'Closing...' : 'Close all positions'}</span>
            </Button>
          )}
          {!isLiveMode && (
            <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">Reset $100k</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Paper Trading Account?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-4">
                    <p>This will reset your paper trading balance back to <strong>$100,000</strong>.</p>
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                      <Checkbox 
                        id="clearHistoryDashboard"
                        checked={clearHistory}
                        onCheckedChange={(checked) => setClearHistory(checked === true)}
                      />
                      <label htmlFor="clearHistoryDashboard" className="text-sm cursor-pointer">
                        <span className="font-medium text-foreground">Clear all trading history</span>
                        <p className="text-muted-foreground mt-1">
                          Delete all paper trades, positions, and equity history for a fresh start.
                        </p>
                      </label>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleResetPaperBalance}
                    disabled={isResetting}
                  >
                    {isResetting ? 'Resetting...' : 'Reset Balance'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isLiveMode && (
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleSellAll}
              disabled={isSelling}
              className="gap-2"
            >
              <Trash2 className={`w-4 h-4 ${isSelling ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">{isSelling ? 'Selling...' : 'Sell All'}</span>
              <span className="sm:hidden">{isSelling ? '...' : 'Sell'}</span>
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
            <span className="hidden sm:inline">Refresh</span>
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

      {/* Meme-coins-only toggle */}
      <MemeCoinsOnlyToggle />

      {/* Market Ticker */}
      <MarketTicker tradingMode={stats.tradingMode} positions={positions} isLoading={isLoading} />

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

      {/* Scalping Performance Stats (6 cards) */}
      <ScalpingStatsRow />


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
          <PositionsTable positions={positions} isLoading={isLoading} isLiveMode={isLiveMode} onRefresh={refetch} />
          <AIDecisionsBreakdownCard />
          <DailyAuditCard />
        </div>
        <div className="space-y-6">
          <AIStatusCard />
          <RecentTradesCard />
        </div>
      </div>
    </div>
    </>
  );
}

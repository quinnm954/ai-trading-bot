import { useEffect, useState } from 'react';
import { Target, Clock, TrendingUp, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

const LIVE_STARTING_EQUITY_FALLBACK = 100;

type VelocityWindow = '24h' | '7d' | 'since start' | null;

interface MilestoneData {
  currentEquity: number;
  cashBalance: number;
  positionsValue: number;
  targetMilestone: number;
  startingBalance: number;
  tradingStartTime: Date | null;
  recentProfitRate: number; // realized profit per hour
  velocityWindow: VelocityWindow;
}

export function MilestoneProgressCard() {
  const { user } = useAuth();
  const [data, setData] = useState<MilestoneData>({
    currentEquity: 0,
    cashBalance: 0,
    positionsValue: 0,
    targetMilestone: 200000,
    startingBalance: 100000,
    tradingStartTime: null,
    recentProfitRate: 0,
    velocityWindow: null,
  });
  const [isLoading, setIsLoading] = useState(true);


  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Get AI settings to determine trading mode + live starting investment
        const { data: aiSettings } = await supabase
          .from('ai_settings')
          .select('trading_mode, live_initial_investment')
          .eq('user_id', user.id)
          .maybeSingle();
        
        const isLiveMode = aiSettings?.trading_mode === 'live';
        const liveStart = Number(aiSettings?.live_initial_investment ?? LIVE_STARTING_EQUITY_FALLBACK);
        
        let cashBalance = 0;
        let liveEquity = 0;
        let startingBalance = 100000;
        let tradingStartTime: Date | null = null;

        if (isLiveMode) {
          // Get live account balance
          const { data: liveAccount } = await supabase
            .from('live_account')
            .select('balance, equity, created_at')
            .eq('user_id', user.id)
            .maybeSingle();
          
          cashBalance = Number(liveAccount?.balance || 0);
          liveEquity = Number(liveAccount?.equity || 0);
          startingBalance = liveStart;
          tradingStartTime = liveAccount?.created_at ? new Date(liveAccount.created_at) : null;
        } else {
          // Get paper account balance
          const { data: paperAccount } = await supabase
            .from('paper_account')
            .select('balance, initial_balance, created_at')
            .eq('user_id', user.id)
            .maybeSingle();
          
          cashBalance = paperAccount?.balance || 0;
          startingBalance = paperAccount?.initial_balance || 100000;
          tradingStartTime = paperAccount?.created_at ? new Date(paperAccount.created_at) : null;
        }

        // Get positions value based on trading mode
        const { data: positions } = await supabase
          .from('positions')
          .select('quantity, current_price, avg_entry_price')
          .eq('user_id', user.id)
          .eq('is_paper', !isLiveMode);

        // Realized P&L over a wall-clock window (7d fetched, 24h derived)
        const now = Date.now();
        const HOUR_MS = 60 * 60 * 1000;
        const weekAgo = new Date(now - 7 * 24 * HOUR_MS);
        const { data: windowTrades } = await supabase
          .from('trades')
          .select('pnl, closed_at')
          .eq('user_id', user.id)
          .eq('is_paper', !isLiveMode)
          .eq('status', 'closed')
          .gte('closed_at', weekAgo.toISOString())
          .order('closed_at', { ascending: false });


        const positionsValue = positions?.reduce((sum, p) => {
          const price = p.current_price || p.avg_entry_price;
          return sum + (Number(p.quantity) * Number(price));
        }, 0) || 0;
        if (isLiveMode && liveEquity > 0) {
          cashBalance = Math.max(0, liveEquity - positionsValue);
        }
        const currentEquity = isLiveMode && liveEquity > 0 ? liveEquity : cashBalance + positionsValue;

        // Velocity = realized P&L per hour of actual elapsed time.
        // Window preference: last 24h -> last 7d -> since trading started.
        const trades = (windowTrades || []).filter((t) => t.closed_at);
        const sumPnl = (rows: typeof trades) =>
          rows.reduce((sum, t) => sum + Number(t.pnl || 0), 0);
        const dayAgoMs = now - 24 * HOUR_MS;
        const last24h = trades.filter((t) => new Date(t.closed_at!).getTime() >= dayAgoMs);
        // Elapsed hours inside a window, capped by how long the account has existed,
        // with a 1-hour floor so simultaneous closes can never explode the rate.
        const elapsedIn = (windowHours: number) => {
          const sinceStart = tradingStartTime
            ? (now - tradingStartTime.getTime()) / HOUR_MS
            : windowHours;
          return Math.max(1, Math.min(windowHours, sinceStart));
        };

        let profitRate = 0;
        let velocityWindow: VelocityWindow = null;

        if (last24h.length > 0) {
          velocityWindow = '24h';
          profitRate = sumPnl(last24h) / elapsedIn(24);
        } else if (trades.length > 0) {
          velocityWindow = '7d';
          profitRate = sumPnl(trades) / elapsedIn(7 * 24);
        } else {

          // Nothing closed in the last week - fall back to lifetime realized P&L
          const { data: allTrades } = await supabase
            .from('trades')
            .select('pnl, closed_at')
            .eq('user_id', user.id)
            .eq('is_paper', !isLiveMode)
            .eq('status', 'closed')
            .order('closed_at', { ascending: true });

          const lifetime = (allTrades || []).filter((t) => t.closed_at);
          if (lifetime.length > 0) {
            const startMs = tradingStartTime
              ? tradingStartTime.getTime()
              : new Date(lifetime[0].closed_at!).getTime();
            // Floor of 1 hour so simultaneous closes can never explode the rate
            const elapsedHours = Math.max(1, (now - startMs) / HOUR_MS);
            velocityWindow = 'since start';
            profitRate = sumPnl(lifetime) / elapsedHours;
          }
        }


        // Calculate target milestone - $1M for live, $200K increments for paper
        const TARGET_EQUITY = isLiveMode ? 1000000 : 200000;
        const MILESTONE_INCREMENT = isLiveMode ? 100000 : 100000;
        const nextMilestone = Math.max(
          TARGET_EQUITY,
          Math.ceil(currentEquity / MILESTONE_INCREMENT) * MILESTONE_INCREMENT
        );

        setData({
          currentEquity,
          cashBalance,
          positionsValue,
          targetMilestone: nextMilestone,
          startingBalance,
          tradingStartTime,
          recentProfitRate: profitRate,
          velocityWindow,
        });

      } catch (error) {
        console.error('Error fetching milestone data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // Safety fallback poll

    // Realtime: refresh immediately on any change to balances, positions, or trades
    const channel = supabase
      .channel(`milestone-progress-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${user.id}` }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'paper_account', filter: `user_id=eq.${user.id}` }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_account', filter: `user_id=eq.${user.id}` }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ai_settings', filter: `user_id=eq.${user.id}` }, fetchData)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Progress is measured from starting balance to target, not from $0
  const totalGoalDistance = Math.max(1, data.targetMilestone - data.startingBalance);
  const distanceCovered = data.currentEquity - data.startingBalance;
  const progress = Math.max(0, Math.min(100, (distanceCovered / totalGoalDistance) * 100));
  const remaining = Math.max(0, data.targetMilestone - data.currentEquity);
  const totalPnl = data.currentEquity - data.startingBalance;
  const pnlPercent = (totalPnl / data.startingBalance) * 100;

  // Estimated time to milestone, based on the same windowed velocity
  const hasVelocity = data.velocityWindow !== null;
  let estimatedTime = 'Not enough data';
  if (remaining <= 0) {
    estimatedTime = 'Milestone reached!';
  } else if (!hasVelocity) {
    estimatedTime = 'Not enough data';
  } else if (data.recentProfitRate > 0) {
    const hoursToMilestone = remaining / data.recentProfitRate;
    if (hoursToMilestone < 1) {
      estimatedTime = `${Math.round(hoursToMilestone * 60)} minutes`;
    } else if (hoursToMilestone < 24) {
      estimatedTime = `${hoursToMilestone.toFixed(1)} hours`;
    } else if (hoursToMilestone < 168) {
      estimatedTime = `${(hoursToMilestone / 24).toFixed(1)} days`;
    } else {
      estimatedTime = `${(hoursToMilestone / 168).toFixed(1)} weeks`;
    }
  } else {
    estimatedTime = 'Need profitable trades';
  }


  if (isLoading) {
    return (
      <div className="glass-panel p-4 sm:p-6 animate-pulse">
        <div className="h-6 bg-secondary/50 rounded w-1/3 mb-4" />
        <div className="h-4 bg-secondary/50 rounded w-full mb-2" />
        <div className="h-8 bg-secondary/50 rounded w-2/3" />
      </div>
    );
  }

  return (
    <div className="glass-panel p-4 sm:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Milestone Progress</h3>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-primary/20 text-primary font-medium">
          Phase 1
        </span>
      </div>

      {/* Current Equity */}
      <div className="text-center py-4">
        <p className="text-sm text-muted-foreground mb-1">Current Equity</p>
        <p className="text-4xl font-bold text-foreground">
          ${data.currentEquity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className={`text-sm font-medium ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
          {totalPnl >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}% from start
        </p>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progress to ${(data.targetMilestone / 1000).toFixed(0)}K</span>
          <span className="font-medium text-foreground">{progress.toFixed(1)}%</span>
        </div>
        <Progress value={progress} className="h-3" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>${(data.startingBalance / 1000).toFixed(0)}K</span>
          <span>${(data.targetMilestone / 1000).toFixed(0)}K</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Zap className="w-4 h-4" />
            <span className="text-xs">Remaining</span>
          </div>
          <p className="font-bold text-foreground">
            ${remaining.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs">Est. Time</span>
          </div>
          <p className="font-bold text-foreground text-sm">
            {estimatedTime}
          </p>
        </div>

        <div
          className="p-3 rounded-lg bg-secondary/30"
          title={
            hasVelocity
              ? `Realized profit per hour over the last ${data.velocityWindow === 'since start' ? 'period since trading started' : data.velocityWindow}`
              : 'No closed trades yet, so no velocity can be measured'
          }
        >
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">
              Velocity{hasVelocity ? ` (${data.velocityWindow})` : ''}
            </span>
          </div>
          {hasVelocity ? (
            <p className={`font-bold ${data.recentProfitRate >= 0 ? 'text-profit' : 'text-loss'}`}>
              {data.recentProfitRate >= 0 ? '+' : ''}${data.recentProfitRate.toFixed(2)}/hr
            </p>
          ) : (
            <p className="font-bold text-muted-foreground">--</p>
          )}
        </div>


        <div className="p-3 rounded-lg bg-secondary/30">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Target className="w-4 h-4" />
            <span className="text-xs">Total P&L</span>
          </div>
          <p className={`font-bold ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="pt-2 border-t border-border/50">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Cash Balance</span>
          <span className="text-foreground">${data.cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-muted-foreground">Positions Value</span>
          <span className="text-foreground">${data.positionsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
}

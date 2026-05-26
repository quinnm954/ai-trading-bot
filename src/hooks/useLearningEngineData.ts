import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { LearningState, MarketRegime } from '@/types/trading';
import { mockLearningState } from '@/lib/mockData';
import { toast } from 'sonner';

interface RegimePerformance {
  strategy: string;
  score: number;
  winRate?: number;
  avgProfit?: number;
  totalTrades?: number;
}

interface LearningResult {
  status: string;
  backtestsRun?: number;
  realTradesAnalyzed?: number;
  strategiesUpdated?: number;
  bestStrategies?: Record<string, { strategy: string; score: number }>;
  topScores?: Array<{
    strategy: string;
    regime: string;
    score: number;
    winRate: number;
    avgProfit: number;
    totalTrades: number;
  }>;
}

export function useLearningEngineData() {
  const { user } = useAuth();
  const [learningState, setLearningState] = useState<LearningState>(mockLearningState);
  const [regimePerformance, setRegimePerformance] = useState<Record<MarketRegime, RegimePerformance>>(
    mockLearningState.regimePerformance
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [lastLearningResult, setLastLearningResult] = useState<LearningResult | null>(null);

  // Map strategy type to display name
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

  const fetchStrategyPerformance = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    
    try {
      // RLS policies automatically filter by user_id = auth.uid()
      const { data, error } = await supabase
        .from('strategy_performance')
        .select('*')
        .order('score', { ascending: false });

      if (error) {
        console.error('Error fetching strategy performance:', error);
        setIsLoading(false);
        return;
      }

      if (data && data.length > 0) {
        // Group by market regime and get best performing strategy for each
        const regimeMap: Record<MarketRegime, RegimePerformance> = {
          trending: { strategy: 'EMA Crossover', score: 0, winRate: 0, avgProfit: 0, totalTrades: 0 },
          ranging: { strategy: 'RSI Strategy', score: 0, winRate: 0, avgProfit: 0, totalTrades: 0 },
          high_volatility: { strategy: 'Grid Bot', score: 0, winRate: 0, avgProfit: 0, totalTrades: 0 },
          low_volatility: { strategy: 'DCA Bot', score: 0, winRate: 0, avgProfit: 0, totalTrades: 0 },
          news_driven: { strategy: 'Hold Cash', score: 0, winRate: 0, avgProfit: 0, totalTrades: 0 },
        };

        data.forEach((row) => {
          const regime = row.market_regime as MarketRegime;
          const score = Number(row.score) || 0;
          const displayName = strategyDisplayName[row.strategy] || row.strategy;
          
          if (regimeMap[regime] && score > regimeMap[regime].score) {
            regimeMap[regime] = {
              strategy: displayName,
              score: Math.round(score),
              winRate: Number(row.win_rate) || 0,
              avgProfit: Number(row.avg_profit) || 0,
              totalTrades: Number(row.total_trades) || 0,
            };
          }
        });

        setRegimePerformance(regimeMap);

        // Calculate totals for learning state
        const totalBacktests = data.reduce((sum, row) => sum + (row.total_trades || 0), 0);
        const avgScore = data.reduce((sum, row) => sum + (Number(row.score) || 0), 0) / data.length;
        const bestPerformance = data[0];

        setLearningState((prev) => ({
          ...prev,
          bestStrategy: strategyDisplayName[bestPerformance.strategy] || bestPerformance.strategy,
          totalBacktests,
          improvementPercent: Math.round(avgScore / 5),
          lastUpdate: new Date(),
          progress: isRunning ? prev.progress : 100,
          currentPhase: isRunning ? prev.currentPhase : 'idle',
        }));
      }
    } catch (error) {
      console.error('Error in fetchStrategyPerformance:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isRunning]);

  // Run the actual learning engine
  const runLearningEngine = useCallback(async () => {
    if (!user) return;

    setIsRunning(true);
    setLearningState((prev) => ({
      ...prev,
      isLearning: true,
      currentPhase: 'backtesting',
      progress: 10,
    }));

    try {
      // Call the learning engine edge function
      const { data, error } = await supabase.functions.invoke('ai-learning-engine', {
        body: {},
      });

      if (error) {
        console.error('Learning engine error:', error);
        toast.error('Learning engine failed: ' + error.message);
        return;
      }

      console.log('Learning engine result:', data);
      setLastLearningResult(data);

      // Update state with results
      setLearningState((prev) => ({
        ...prev,
        currentPhase: 'optimizing',
        progress: 80,
      }));

      // Fetch updated performance data
      await fetchStrategyPerformance();

      toast.success(`Learning complete! Analyzed ${data.backtestsRun || 0} backtests and ${data.realTradesAnalyzed || 0} real trades.`);

      // Final state
      setLearningState((prev) => ({
        ...prev,
        currentPhase: 'idle',
        progress: 100,
        isLearning: false,
        lastUpdate: new Date(),
      }));

    } catch (error) {
      console.error('Error running learning engine:', error);
      toast.error('Failed to run learning engine');
    } finally {
      setIsRunning(false);
    }
  }, [user, fetchStrategyPerformance]);

  const toggleLearning = useCallback(() => {
    if (isRunning) {
      // Stop learning (just update UI, can't actually stop edge function)
      setIsRunning(false);
      setLearningState((prev) => ({
        ...prev,
        isLearning: false,
        currentPhase: 'idle',
      }));
    } else {
      // Start learning
      runLearningEngine();
    }
  }, [isRunning, runLearningEngine]);

  useEffect(() => {
    fetchStrategyPerformance();

    // Auto-refresh every 30 seconds
    const intervalId = setInterval(() => {
      if (!isRunning) {
        fetchStrategyPerformance();
      }
    }, 30000);

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`strategy-performance-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'strategy_performance',
        },
        (payload) => {
          console.log('Real-time update received:', payload);
          // Refetch all data when any change occurs
          fetchStrategyPerformance();
          
          // Update last update timestamp
          setLearningState((prev) => ({
            ...prev,
            lastUpdate: new Date(),
          }));
        }
      )
      .subscribe();

    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(channel);
    };
  }, [fetchStrategyPerformance, isRunning]);

  // Simulate progress updates when learning is running
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setLearningState((prev) => {
        if (prev.progress >= 75) return prev; // Don't go past 75% in simulation
        
        const phases: LearningState['currentPhase'][] = ['backtesting', 'analyzing', 'optimizing'];
        const phaseIndex = Math.floor((prev.progress / 75) * 3) % 3;
        
        return {
          ...prev,
          progress: Math.min(75, prev.progress + 5),
          currentPhase: phases[phaseIndex],
          lastUpdate: new Date(),
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  return {
    learningState,
    regimePerformance,
    isLoading,
    isRunning,
    toggleLearning,
    runLearningEngine,
    lastLearningResult,
    refetch: fetchStrategyPerformance,
  };
}

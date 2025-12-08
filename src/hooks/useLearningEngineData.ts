import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { LearningState, MarketRegime } from '@/types/trading';
import { mockLearningState } from '@/lib/mockData';

interface RegimePerformance {
  strategy: string;
  score: number;
}

export function useLearningEngineData() {
  const { user } = useAuth();
  const [learningState, setLearningState] = useState<LearningState>(mockLearningState);
  const [regimePerformance, setRegimePerformance] = useState<Record<MarketRegime, RegimePerformance>>(
    mockLearningState.regimePerformance
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(mockLearningState.isLearning);

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
          trending: { strategy: 'EMA Crossover', score: 0 },
          ranging: { strategy: 'RSI Strategy', score: 0 },
          high_volatility: { strategy: 'Grid Bot', score: 0 },
          low_volatility: { strategy: 'DCA Bot', score: 0 },
          news_driven: { strategy: 'Hold Cash', score: 0 },
        };

        data.forEach((row) => {
          const regime = row.market_regime as MarketRegime;
          const score = Number(row.score) || 0;
          const displayName = strategyDisplayName[row.strategy] || row.strategy;
          
          if (regimeMap[regime] && score > regimeMap[regime].score) {
            regimeMap[regime] = {
              strategy: displayName,
              score: Math.round(score),
            };
          }
        });

        setRegimePerformance(regimeMap);

        // Update learning state with real data
        const bestPerformance = data[0];
        const totalBacktests = data.reduce((sum, row) => sum + (row.total_trades || 0), 0);
        const avgScore = data.reduce((sum, row) => sum + (Number(row.score) || 0), 0) / data.length;

        setLearningState((prev) => ({
          ...prev,
          bestStrategy: strategyDisplayName[bestPerformance.strategy] || bestPerformance.strategy,
          totalBacktests,
          improvementPercent: Math.round(avgScore / 5),
          lastUpdate: new Date(),
        }));
      }
    } catch (error) {
      console.error('Error in fetchStrategyPerformance:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const toggleLearning = useCallback(() => {
    setIsRunning((prev) => !prev);
    setLearningState((prev) => ({
      ...prev,
      isLearning: !prev.isLearning,
      currentPhase: prev.isLearning ? 'idle' : 'backtesting',
    }));
  }, []);

  useEffect(() => {
    fetchStrategyPerformance();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('strategy-performance-changes')
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
      supabase.removeChannel(channel);
    };
  }, [fetchStrategyPerformance]);

  // Simulate progress updates when learning is running
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setLearningState((prev) => {
        const newProgress = prev.progress >= 100 ? 0 : prev.progress + 1;
        const phases: LearningState['currentPhase'][] = ['backtesting', 'analyzing', 'optimizing'];
        const phaseIndex = Math.floor((newProgress / 100) * 3) % 3;
        
        return {
          ...prev,
          progress: newProgress,
          currentPhase: phases[phaseIndex],
          lastUpdate: new Date(),
        };
      });
    }, 500);

    return () => clearInterval(interval);
  }, [isRunning]);

  return {
    learningState,
    regimePerformance,
    isLoading,
    isRunning,
    toggleLearning,
    refetch: fetchStrategyPerformance,
  };
}

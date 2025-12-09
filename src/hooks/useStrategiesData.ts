import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface StrategyPerformance {
  id: string;
  strategy: string;
  marketRegime: string;
  score: number;
  winRate: number;
  totalTrades: number;
  avgProfit: number;
}

interface Strategy {
  id: string;
  name: string;
  type: string;
  description: string;
  isActive: boolean;
  performance: {
    winRate: number;
    totalTrades: number;
    profit: number;
    score: number;
  };
}

const strategyMeta: Record<string, { name: string; description: string }> = {
  rsi: {
    name: 'RSI Strategy',
    description: 'Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)',
  },
  ema_crossover: {
    name: 'EMA Crossover',
    description: 'Golden cross (fast EMA crosses above slow EMA) for buy, death cross for sell',
  },
  macd: {
    name: 'MACD Momentum',
    description: 'Trade based on MACD histogram crossovers and divergences for momentum signals',
  },
  trend_breakout: {
    name: 'Trend Breakout',
    description: 'Enter positions when price breaks through key resistance/support with volume',
  },
  volatility_breakout: {
    name: 'Volatility Breakout',
    description: 'Capitalize on volatility expansion using ATR-based entries during range breakouts',
  },
  grid: {
    name: 'Grid Bot',
    description: 'Place buy/sell orders at regular intervals to profit from volatility',
  },
  dca: {
    name: 'DCA Bot',
    description: 'Dollar-cost average into positions over time for long-term accumulation',
  },
  custom: {
    name: 'Custom Strategy',
    description: 'User-defined custom trading rules and logic',
  },
};

export function useStrategiesData() {
  const { user } = useAuth();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [performanceData, setPerformanceData] = useState<StrategyPerformance[]>([]);
  const [currentRegime, setCurrentRegime] = useState<string>('ranging');
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch AI settings to get current regime
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('current_regime, enabled')
        .eq('user_id', user.id)
        .maybeSingle();

      const regime = aiSettings?.current_regime || 'ranging';
      const aiEnabled = aiSettings?.enabled || false;
      setCurrentRegime(regime);

      const { data, error } = await supabase
        .from('strategy_performance')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching strategy performance:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        setPerformanceData(data.map(d => ({
          id: d.id,
          strategy: d.strategy,
          marketRegime: d.market_regime,
          score: Number(d.score) || 0,
          winRate: Number(d.win_rate) || 0,
          totalTrades: d.total_trades || 0,
          avgProfit: Number(d.avg_profit) || 0,
        })));

        // Find best strategy for current regime
        const regimeStrategies = data.filter(d => d.market_regime === regime);
        const bestStrategy = regimeStrategies.sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))[0];

        // Aggregate strategy data across regimes
        const strategyMap = new Map<string, Strategy>();
        
        data.forEach(row => {
          const type = row.strategy;
          const meta = strategyMeta[type] || { name: type, description: '' };
          
          if (!strategyMap.has(type)) {
            strategyMap.set(type, {
              id: type,
              name: meta.name,
              type,
              description: meta.description,
              // Active if AI is enabled and this is the best strategy for current regime
              isActive: aiEnabled && bestStrategy?.strategy === type,
              performance: {
                winRate: 0,
                totalTrades: 0,
                profit: 0,
                score: 0,
              },
            });
          }

          const existing = strategyMap.get(type)!;
          existing.performance.totalTrades += row.total_trades || 0;
          existing.performance.profit += Number(row.avg_profit) || 0;
          existing.performance.score = Math.max(existing.performance.score, Number(row.score) || 0);
        });

        // Calculate average win rate
        strategyMap.forEach((strategy) => {
          const regimeData = data.filter(d => d.strategy === strategy.type);
          if (regimeData.length > 0) {
            strategy.performance.winRate = 
              regimeData.reduce((sum, d) => sum + (Number(d.win_rate) || 0), 0) / regimeData.length;
          }
        });

        setStrategies(Array.from(strategyMap.values()));
      }
    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const toggleStrategy = useCallback(async (strategyType: string) => {
    setStrategies(prev => 
      prev.map(s => s.type === strategyType ? { ...s, isActive: !s.isActive } : s)
    );
    toast.success(`Strategy ${strategies.find(s => s.type === strategyType)?.isActive ? 'deactivated' : 'activated'}`);
  }, [strategies]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    strategies,
    performanceData,
    currentRegime,
    isLoading,
    toggleStrategy,
    refetch: fetchData,
  };
}

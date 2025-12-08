import { useState } from 'react';
import { 
  Brain, 
  Play, 
  Pause, 
  RefreshCw, 
  TrendingUp,
  BarChart3,
  Target,
  Zap,
  CheckCircle,
  Clock,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mockLearningState, mockRegimePerformance } from '@/lib/mockData';
import type { MarketRegime } from '@/types/trading';

const regimeLabels: Record<MarketRegime, string> = {
  trending: 'Trending',
  ranging: 'Ranging',
  high_volatility: 'High Volatility',
  low_volatility: 'Low Volatility',
  news_driven: 'News Driven',
};

const regimeColors: Record<MarketRegime, string> = {
  trending: 'text-profit',
  ranging: 'text-primary',
  high_volatility: 'text-warning',
  low_volatility: 'text-muted-foreground',
  news_driven: 'text-loss',
};

export default function AILearningEngine() {
  const [learningState, setLearningState] = useState(mockLearningState);
  const [isRunning, setIsRunning] = useState(learningState.isLearning);

  const toggleLearning = () => {
    setIsRunning(!isRunning);
    setLearningState(prev => ({ ...prev, isLearning: !prev.isLearning }));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">AI Learning Engine</h1>
            <span className="px-2 py-0.5 text-xs font-bold rounded bg-warning/20 text-warning animate-pulse">
              REINFORCEMENT
            </span>
          </div>
          <p className="text-muted-foreground">
            Titan learns which strategies work best in different market conditions
          </p>
        </div>
        <Button 
          variant={isRunning ? 'glow-success' : 'glow'}
          onClick={toggleLearning}
          className="gap-2"
        >
          {isRunning ? (
            <>
              <Pause className="w-4 h-4" />
              Pause Learning
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Start Learning
            </>
          )}
        </Button>
      </div>

      {/* Learning Progress */}
      <div className="glass-panel p-6 gradient-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-3 rounded-xl',
              isRunning ? 'bg-primary/20' : 'bg-secondary'
            )}>
              <Brain className={cn(
                'w-6 h-6',
                isRunning ? 'text-primary animate-pulse' : 'text-muted-foreground'
              )} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Learning Progress</h3>
              <p className="text-sm text-muted-foreground capitalize">
                Phase: {learningState.currentPhase.replace('_', ' ')}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary">{learningState.progress}%</p>
            <p className="text-xs text-muted-foreground">Complete</p>
          </div>
        </div>

        <div className="h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
            style={{ width: `${learningState.progress}%` }}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="p-4 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">Backtests Run</span>
            </div>
            <p className="text-xl font-bold text-foreground">{learningState.totalBacktests.toLocaleString()}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-profit" />
              <span className="text-xs text-muted-foreground">Improvement</span>
            </div>
            <p className="text-xl font-bold text-profit">+{learningState.improvementPercent}%</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-warning" />
              <span className="text-xs text-muted-foreground">Best Strategy</span>
            </div>
            <p className="text-xl font-bold text-foreground">{learningState.bestStrategy}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary/30">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Last Update</span>
            </div>
            <p className="text-xl font-bold text-foreground">
              {learningState.lastUpdate.toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>

      {/* Regime Performance */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          Best Strategy by Market Regime
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          Titan automatically selects the optimal strategy based on detected market conditions
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(regimeLabels) as MarketRegime[]).map((regime) => {
            const performance = mockRegimePerformance[regime];
            return (
              <div 
                key={regime}
                className="p-4 rounded-lg bg-secondary/30 border border-border/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={cn('text-sm font-medium', regimeColors[regime])}>
                    {regimeLabels[regime]}
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded bg-primary/20 text-primary">
                    Score: {performance.score}
                  </span>
                </div>
                <p className="text-lg font-bold text-foreground">{performance.strategy}</p>
                <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-profit"
                    style={{ width: `${performance.score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optimized Parameters */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-warning" />
          AI-Optimized Parameters
        </h3>
        <p className="text-sm text-muted-foreground mb-6">
          These parameters were automatically tuned by the learning engine for maximum performance
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(learningState.bestParams).map(([key, value]) => (
            <div 
              key={key}
              className="p-4 rounded-lg bg-secondary/30 border border-primary/20"
            >
              <p className="text-xs text-muted-foreground mb-1 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </p>
              <p className="text-lg font-bold text-foreground">{value.toString()}</p>
              <div className="flex items-center gap-1 mt-1">
                <CheckCircle className="w-3 h-3 text-profit" />
                <span className="text-xs text-profit">Optimized</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Warning */}
      <div className="p-4 rounded-lg bg-warning/10 border border-warning/30">
        <p className="text-sm text-warning flex items-center gap-2">
          <Zap className="w-4 h-4" />
          <strong>Paper Trading Only:</strong> The AI Learning Engine only experiments with simulated trades. 
          No real money is ever used during the learning process.
        </p>
      </div>
    </div>
  );
}

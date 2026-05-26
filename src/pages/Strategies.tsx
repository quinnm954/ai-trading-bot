import { useState } from 'react';
import { 
  Layers, 
  Play, 
  Pause, 
  Settings, 
  TrendingUp,
  BarChart3,
  Zap,
  Plus,
  Activity,
  Target,
  GitBranch,
  Loader2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useStrategiesData } from '@/hooks/useStrategiesData';

const RECOMMENDED_TYPES = new Set(['trend_breakout', 'rsi']);

const strategyIcons: Record<string, React.ReactNode> = {
  rsi: <BarChart3 className="w-5 h-5" />,
  ema_crossover: <TrendingUp className="w-5 h-5" />,
  macd: <Activity className="w-5 h-5" />,
  trend_breakout: <TrendingUp className="w-5 h-5" />,
  volatility_breakout: <Zap className="w-5 h-5" />,
  grid: <Layers className="w-5 h-5" />,
  dca: <Target className="w-5 h-5" />,
  custom: <GitBranch className="w-5 h-5" />,
};

export default function Strategies() {
  const { strategies, isLoading, toggleStrategy } = useStrategiesData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trading Strategies</h1>
          <p className="text-muted-foreground">Configure and manage your automated trading strategies</p>
        </div>
        <Button variant="glow" className="gap-2">
          <Plus className="w-4 h-4" />
          Create Strategy
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Strategies</p>
          <p className="text-2xl font-bold text-foreground">{strategies.length}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Active Strategies</p>
          <p className="text-2xl font-bold text-profit">{strategies.filter(s => s.isActive).length}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
          <p className="text-2xl font-bold text-foreground">
            {strategies.reduce((sum, s) => sum + s.performance.totalTrades, 0)}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Avg Win Rate</p>
          <p className="text-2xl font-bold text-foreground">
            {strategies.length > 0 
              ? (strategies.reduce((sum, s) => sum + s.performance.winRate, 0) / strategies.length).toFixed(1)
              : 0}%
          </p>
        </div>
      </div>

      {strategies.length === 0 ? (
        <div className="glass-panel p-12 text-center">
          <Layers className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No strategies configured yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Strategy performance data will appear as the AI learns and trades
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {strategies.map((strategy) => (
            <div 
              key={strategy.id}
              className={cn(
                'glass-panel p-6 transition-all duration-300',
                strategy.isActive && 'border-primary/30 glow-primary'
              )}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'p-3 rounded-xl',
                    strategy.isActive ? 'bg-primary/20 text-primary' : 'bg-secondary text-muted-foreground'
                  )}>
                    {strategyIcons[strategy.type] || <Layers className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{strategy.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{strategy.type.replace(/_/g, ' ')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon">
                    <Settings className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant={strategy.isActive ? 'glow-success' : 'outline'}
                    size="sm"
                    onClick={() => toggleStrategy(strategy.type)}
                    className="gap-2"
                  >
                    {strategy.isActive ? (
                      <>
                        <Pause className="w-4 h-4" />
                        Active
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Start
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4">{strategy.description}</p>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                  <p className="text-lg font-bold text-foreground">{strategy.performance.winRate.toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
                  <p className="text-lg font-bold text-foreground">{strategy.performance.totalTrades}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Score</p>
                  <p className="text-lg font-bold text-primary">{strategy.performance.score}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Profit Factor</p>
                  <p className={cn(
                    "text-lg font-bold",
                    strategy.performance.profitFactor >= 1.5 ? "text-profit" : 
                    strategy.performance.profitFactor >= 1 ? "text-foreground" : "text-loss"
                  )}>
                    {strategy.performance.profitFactor > 0 ? strategy.performance.profitFactor.toFixed(2) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Max Drawdown</p>
                  <p className={cn(
                    "text-lg font-bold",
                    strategy.performance.maxDrawdown <= 5 ? "text-profit" :
                    strategy.performance.maxDrawdown <= 10 ? "text-warning" : "text-loss"
                  )}>
                    {strategy.performance.maxDrawdown > 0 ? `-${strategy.performance.maxDrawdown.toFixed(1)}%` : '—'}
                  </p>
                </div>
              </div>

              {/* Performance Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>AI Confidence Score</span>
                  <span>{strategy.performance.score}/100</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-primary to-profit transition-all duration-500"
                    style={{ width: `${strategy.performance.score}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

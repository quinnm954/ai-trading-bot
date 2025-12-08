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
  GitBranch
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { mockStrategies } from '@/lib/mockData';
import type { Strategy } from '@/types/trading';

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

const allStrategies: Strategy[] = [
  ...mockStrategies,
  {
    id: '5',
    name: 'MACD Momentum',
    type: 'macd',
    description: 'Trade based on MACD histogram crossovers and divergences for momentum signals',
    isActive: false,
    params: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      positionSize: 5,
      stopLoss: 2.5,
      takeProfit: 5,
    },
    performance: {
      winRate: 54.2,
      totalTrades: 67,
      profit: 2890.40,
    },
  },
  {
    id: '6',
    name: 'Trend Breakout',
    type: 'trend_breakout',
    description: 'Enter positions when price breaks through key resistance/support with volume confirmation',
    isActive: false,
    params: {
      lookbackPeriod: 20,
      breakoutThreshold: 1.5,
      volumeMultiplier: 2.0,
      positionSize: 6,
      stopLoss: 3,
      takeProfit: 8,
    },
    performance: {
      winRate: 48.5,
      totalTrades: 42,
      profit: 4120.80,
    },
  },
  {
    id: '7',
    name: 'Volatility Breakout',
    type: 'volatility_breakout',
    description: 'Capitalize on volatility expansion using ATR-based entries during range breakouts',
    isActive: true,
    params: {
      atrPeriod: 14,
      atrMultiplier: 2.0,
      positionSize: 4,
      stopLoss: 2,
      takeProfit: 4,
    },
    performance: {
      winRate: 52.8,
      totalTrades: 89,
      profit: 3650.25,
    },
  },
];

export default function Strategies() {
  const [strategies, setStrategies] = useState(allStrategies);

  const toggleStrategy = (id: string) => {
    setStrategies(prev => 
      prev.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s)
    );
  };

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
                  {strategyIcons[strategy.type]}
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
                  onClick={() => toggleStrategy(strategy.id)}
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

            {strategy.performance && (
              <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-secondary/30">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
                  <p className="text-lg font-bold text-foreground">{strategy.performance.winRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
                  <p className="text-lg font-bold text-foreground">{strategy.performance.totalTrades}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Total Profit</p>
                  <p className={cn(
                    'text-lg font-bold',
                    strategy.performance.profit >= 0 ? 'text-profit' : 'text-loss'
                  )}>
                    ${strategy.performance.profit.toLocaleString()}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {Object.entries(strategy.params).slice(0, 4).map(([key, value]) => (
                <span 
                  key={key}
                  className="px-2 py-1 rounded text-xs bg-secondary text-muted-foreground"
                >
                  {key.replace(/([A-Z])/g, ' $1').trim()}: {value.toString()}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

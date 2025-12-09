import { Activity, TrendingUp, Minus, Zap, Radio, Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAISettings } from '@/hooks/useAISettings';
import type { MarketRegime } from '@/types/trading';

const regimeConfig: Record<MarketRegime, { 
  label: string; 
  icon: React.ElementType; 
  color: string;
  bgColor: string;
  description: string;
}> = {
  trending: {
    label: 'Trending',
    icon: TrendingUp,
    color: 'text-profit',
    bgColor: 'bg-profit/20',
    description: 'Strong directional momentum detected. Trend-following strategies active.',
  },
  ranging: {
    label: 'Ranging',
    icon: Minus,
    color: 'text-primary',
    bgColor: 'bg-primary/20',
    description: 'Market consolidating. Mean-reversion and grid strategies preferred.',
  },
  high_volatility: {
    label: 'High Volatility',
    icon: Zap,
    color: 'text-warning',
    bgColor: 'bg-warning/20',
    description: 'Elevated volatility. Reduced position sizes and wider stops applied.',
  },
  low_volatility: {
    label: 'Low Volatility',
    icon: Radio,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/20',
    description: 'Low activity period. Conservative positioning recommended.',
  },
  news_driven: {
    label: 'News Driven',
    icon: Newspaper,
    color: 'text-loss',
    bgColor: 'bg-loss/20',
    description: 'Event-driven market. Caution advised, positions may be paused.',
  },
};

export function MarketRegimeCard() {
  const { settings, isLoading } = useAISettings();
  
  const regime: MarketRegime = settings?.currentRegime || 'ranging';
  const config = regimeConfig[regime];
  const Icon = config.icon;

  if (isLoading) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Activity className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Market Regime</p>
            <p className="font-bold text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('p-2 rounded-lg', config.bgColor)}>
          <Icon className={cn('w-5 h-5', config.color)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Market Regime</p>
          <p className={cn('text-lg font-bold', config.color)}>{config.label}</p>
        </div>
        <div className="ml-auto">
          <Activity className={cn('w-4 h-4 animate-pulse', config.color)} />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">{config.description}</p>
    </div>
  );
}

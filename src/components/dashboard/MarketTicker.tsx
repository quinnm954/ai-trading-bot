import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { useMarketData } from '@/hooks/useMarketData';
import { cn } from '@/lib/utils';

export function MarketTicker() {
  const { marketData, isLoading, error } = useMarketData();

  if (isLoading) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-thin">
          {[1, 2, 3, 4, 5].map((i) => (
            <div 
              key={i}
              className="flex items-center gap-4 px-4 py-2 rounded-lg bg-secondary/50 min-w-fit animate-pulse"
            >
              <div>
                <div className="h-4 w-12 bg-muted rounded mb-2" />
                <div className="h-6 w-20 bg-muted rounded" />
              </div>
              <div className="h-5 w-16 bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || marketData.length === 0) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm">Unable to load market data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-6 overflow-x-auto scrollbar-thin">
        {marketData.map((market) => (
          <div 
            key={market.symbol}
            className="flex items-center gap-4 px-4 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer min-w-fit"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{market.symbol}</p>
              <p className="text-lg font-bold font-mono">
                ${market.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className={cn(
              'flex items-center gap-1 text-sm font-medium',
              market.changePercent >= 0 ? 'text-profit' : 'text-loss'
            )}>
              {market.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{market.changePercent >= 0 ? '+' : ''}{market.changePercent.toFixed(2)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

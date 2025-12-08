import { TrendingUp, TrendingDown } from 'lucide-react';
import { mockMarketData } from '@/lib/mockData';
import { cn } from '@/lib/utils';

export function MarketTicker() {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-6 overflow-x-auto scrollbar-thin">
        {mockMarketData.map((market) => (
          <div 
            key={market.symbol}
            className="flex items-center gap-4 px-4 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer min-w-fit"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{market.symbol}</p>
              <p className="text-lg font-bold font-mono">
                ${market.price.toLocaleString()}
              </p>
            </div>
            <div className={cn(
              'flex items-center gap-1 text-sm font-medium',
              market.change >= 0 ? 'text-profit' : 'text-loss'
            )}>
              {market.change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{market.change >= 0 ? '+' : ''}{market.changePercent.toFixed(2)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActiveTickerPosition {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  avgEntryPrice: number;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  pnlPercent: number;
}

interface MarketTickerProps {
  tradingMode: 'paper' | 'live';
  positions: ActiveTickerPosition[];
  isLoading: boolean;
}

export function MarketTicker({ tradingMode, positions, isLoading }: MarketTickerProps) {
  const isPaper = tradingMode === 'paper';
  const label = isPaper ? 'Paper' : 'Live';

  if (isLoading) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center gap-6 overflow-x-auto scrollbar-thin">
          {[1, 2, 3].map((i) => (
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

  if (positions.length === 0) {
    return (
      <div className="glass-panel p-4">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Activity className="w-4 h-4" />
          <span className="text-sm">No active {label.toLowerCase()} trades</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center gap-3 mb-2">
        <Activity className="w-4 h-4 text-primary" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Active {label} Trades ({positions.length})
        </span>
      </div>
      <div className="flex items-center gap-6 overflow-x-auto scrollbar-thin">
        {positions.map((p) => {
          const up = (p.pnlPercent ?? 0) >= 0;
          const price = p.currentPrice ?? p.avgEntryPrice;
          const pnl = p.unrealizedPnl ?? 0;
          return (
            <div
              key={p.id}
              className="flex items-center gap-4 px-4 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors min-w-fit"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {p.symbol}
                  <span className="ml-2 text-[10px] uppercase text-muted-foreground">
                    {p.side}
                  </span>
                </p>
                <p className="text-lg font-bold font-mono">
                  ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: price < 1 ? 6 : 2 })}
                </p>
              </div>
              <div className={cn(
                'flex flex-col items-end text-sm font-medium',
                up ? 'text-profit' : 'text-loss'
              )}>
                <div className="flex items-center gap-1">
                  {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  <span>{up ? '+' : ''}{p.pnlPercent.toFixed(2)}%</span>
                </div>
                <span className="text-xs font-mono">
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

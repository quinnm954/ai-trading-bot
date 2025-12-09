import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePositionsData } from '@/hooks/usePositionsData';
import { useDashboardData } from '@/hooks/useDashboardData';

export function PositionsTable() {
  const { stats } = useDashboardData();
  const isPaper = stats.tradingMode === 'paper';
  const { positions, isLoading } = usePositionsData(isPaper);

  if (isLoading) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Open Positions</h3>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
        <div className="h-32 flex items-center justify-center text-muted-foreground">
          Loading positions...
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Open Positions</h3>
          <p className="text-sm text-muted-foreground">{positions.length} active positions</p>
        </div>
      </div>
      
      {positions.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-muted-foreground">
          No open positions
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Side</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Qty</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entry</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Current</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
                <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Strategy</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const pnl = position.unrealizedPnl || 0;
                const pnlPercent = position.pnlPercent || 0;
                const displaySide = position.side === 'buy' ? 'long' : 'short';
                
                return (
                  <tr 
                    key={position.id} 
                    className="border-b border-border/50 hover:bg-secondary/50 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold">
                          {position.symbol.slice(0, 2)}
                        </div>
                        <span className="font-medium text-foreground">{position.symbol}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={cn(
                        'px-2 py-1 rounded text-xs font-medium uppercase',
                        displaySide === 'long' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                      )}>
                        {displaySide}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-sm">{position.quantity}</td>
                    <td className="py-4 px-4 text-right font-mono text-sm text-muted-foreground">
                      ${position.avgEntryPrice.toLocaleString()}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-sm">
                      ${position.currentPrice?.toLocaleString() || '-'}
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className={cn(
                        'flex items-center justify-end gap-1',
                        pnl >= 0 ? 'text-profit' : 'text-loss'
                      )}>
                        {pnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="font-mono text-sm font-medium">
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                        </span>
                        <span className="text-xs">
                          ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="px-2 py-1 rounded text-xs bg-secondary text-muted-foreground">
                        {position.strategy || 'manual'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

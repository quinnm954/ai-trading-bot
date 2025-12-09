import { ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRecentTrades } from '@/hooks/useRecentTrades';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

export function RecentTradesCard() {
  const { stats } = useDashboardData();
  const isPaper = stats.tradingMode === 'paper';
  const { trades, isLoading } = useRecentTrades(isPaper, 4);

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Recent Trades</h3>
          <p className="text-sm text-muted-foreground">Last 24 hours</p>
        </div>
        <Link to="/trades">
          <Button variant="ghost" size="sm" className="gap-2">
            View All
            <ExternalLink className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="h-32 flex items-center justify-center text-muted-foreground">
          Loading trades...
        </div>
      ) : trades.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-muted-foreground">
          No recent trades
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((trade) => (
            <div 
              key={trade.id}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-2 rounded-lg',
                  trade.pnl && trade.pnl >= 0 ? 'bg-success/20' : 'bg-destructive/20'
                )}>
                  {trade.pnl && trade.pnl >= 0 ? (
                    <ArrowUpRight className="w-4 h-4 text-success" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 text-destructive" />
                  )}
                </div>
                <div>
                  <p className="font-medium text-foreground">{trade.symbol}</p>
                  <p className="text-xs text-muted-foreground">
                    {trade.strategy || 'manual'} • {trade.quantity.toFixed(6)} units
                    {trade.aiReasoning?.includes('direct swap') && ' • 🔄 converted'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn(
                  'font-mono font-medium',
                  trade.pnl && trade.pnl >= 0 ? 'text-profit' : 'text-loss'
                )}>
                  {trade.pnl && trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2) || '0.00'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {trade.closedAt?.toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

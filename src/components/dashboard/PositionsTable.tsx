import { useState } from 'react';
import { TrendingUp, TrendingDown, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DashboardPosition } from '@/hooks/useDashboardData';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PositionsTableProps {
  positions: DashboardPosition[];
  isLoading: boolean;
  isLiveMode?: boolean;
  onRefresh?: () => void;
}

export function PositionsTable({ positions, isLoading, isLiveMode = false, onRefresh }: PositionsTableProps) {
  const { toast } = useToast();
  const [sellingId, setSellingId] = useState<string | null>(null);

  const handleSellPosition = async (position: DashboardPosition) => {
    if (!confirm(`Sell ${position.quantity.toFixed(6)} ${position.symbol}?`)) return;
    
    setSellingId(position.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast({ title: 'Not authenticated', variant: 'destructive' });
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-take-profit?action=force-sell&position_id=${encodeURIComponent(position.id)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();
      
      if (result.status === 'success') {
        const pnl = result.pnl || 0;
        toast({
          title: `Sold ${position.symbol}`,
          description: `P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}${result.coinbaseSell?.success ? ` | Received: $${result.coinbaseSell.usdValue?.toFixed(2)}` : ''}`,
        });
        onRefresh?.();
      } else {
        toast({ 
          title: 'Sell failed', 
          description: result.error || 'Unknown error',
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ title: 'Sell failed', variant: 'destructive' });
    } finally {
      setSellingId(null);
    }
  };

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
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Invested</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Value</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
                <th className="text-right py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const pnl = position.unrealizedPnl || 0;
                const pnlPercent = position.pnlPercent || 0;
                const displaySide = position.side === 'buy' ? 'long' : 'short';
                const isSelling = sellingId === position.id;
                
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
                    <td className="py-4 px-4 text-right font-mono text-sm">{position.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                    <td className="py-4 px-4 text-right font-mono text-sm text-muted-foreground">
                      ${position.initialInvestment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-sm font-medium text-foreground">
                      ${position.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    <td className="py-4 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSellPosition(position)}
                        disabled={isSelling}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        {isSelling ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>Sell <X className="w-4 h-4 ml-1" /></>
                        )}
                      </Button>
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

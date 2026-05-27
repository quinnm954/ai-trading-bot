import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Flame, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLiquidationMap } from '@/hooks/useLiquidationMap';

interface Props {
  symbol?: string;
  limit?: number;
}

export function LiquidationMapCard({ symbol, limit = 8 }: Props) {
  const { clusters, isLoading } = useLiquidationMap(symbol);
  const top = clusters.slice(0, limit);
  const maxSize = top.reduce((m, c) => Math.max(m, Number(c.cluster_size_usd)), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flame className="w-4 h-4 text-warning" />
          Liquidation Map {symbol && <span className="text-muted-foreground">· {symbol}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading clusters…</p>
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No liquidation clusters detected yet. The scanner aggregates leveraged positions every few minutes.
          </p>
        ) : (
          <div className="space-y-2">
            {top.map((c) => {
              const pct = maxSize > 0 ? (Number(c.cluster_size_usd) / maxSize) * 100 : 0;
              const isLong = c.side === 'long';
              return (
                <div key={c.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {isLong ? (
                        <TrendingDown className="w-3 h-3 text-loss" />
                      ) : (
                        <TrendingUp className="w-3 h-3 text-profit" />
                      )}
                      <span className="font-medium">{c.symbol}</span>
                      <Badge variant="outline" className="text-[10px] h-4">
                        {isLong ? 'long liq' : 'short liq'}
                      </Badge>
                      <span className="text-muted-foreground tabular-nums">
                        ${Number(c.price_level).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </span>
                    </div>
                    <span className="text-muted-foreground tabular-nums">
                      ${Number(c.cluster_size_usd).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn('h-full transition-all', isLong ? 'bg-loss' : 'bg-profit')}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

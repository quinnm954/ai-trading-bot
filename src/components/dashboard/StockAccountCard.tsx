import { Link } from 'react-router-dom';
import { LineChart, Clock, Link2Off } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PDTWarning } from '@/components/trading/PDTWarning';
import { isRegularSessionNow, useStockAccount } from '@/hooks/useStockAccount';

const money = (v: number) =>
  `${v < 0 ? '-' : ''}$${Math.abs(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

/**
 * Stock account panel. Only rendered while the account is in stocks mode, so the
 * crypto dashboard is untouched.
 */
export function StockAccountCard() {
  const { connected, balance, buyingPower, equity, lastSyncedAt, positions, positionsValue, unrealizedPnl, loading } =
    useStockAccount();
  const sessionOpen = isRegularSessionNow();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <LineChart className="h-4 w-4 text-primary" /> Stock account
          </CardTitle>
          <Badge variant={sessionOpen ? 'default' : 'secondary'} className="gap-1">
            <Clock className="h-3 w-3" />
            {sessionOpen ? 'Market open' : 'Market closed'}
          </Badge>
        </div>
        <CardDescription>US stocks and ETFs through Alpaca. Long only, regular hours.</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!connected && !loading ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Link2Off className="h-4 w-4 mt-0.5 shrink-0" />
              <p>No Alpaca account connected yet, so stock trading stays paused.</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link to="/api-keys">Connect Alpaca</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Cash</p>
                <p className="font-semibold">{money(balance)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Buying power</p>
                <p className="font-semibold">{money(buyingPower)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Equity</p>
                <p className="font-semibold">{money(equity)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Open positions</p>
                <p className="font-semibold">
                  {positions.length} · {money(positionsValue)}
                </p>
              </div>
            </div>

            {positions.length > 0 && (
              <div className="space-y-1">
                {positions.slice(0, 5).map((p) => {
                  const pnl = Number(p.unrealized_pnl ?? 0);
                  return (
                    <div key={p.id} className="flex items-center justify-between text-xs">
                      <span className="font-medium">{p.symbol}</span>
                      <span className="text-muted-foreground">
                        {Number(p.quantity).toLocaleString(undefined, { maximumFractionDigits: 4 })} sh
                      </span>
                      <span className={pnl >= 0 ? 'text-success' : 'text-destructive'}>{money(pnl)}</span>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-1">
                  Unrealised across stock positions: {money(unrealizedPnl)}
                </p>
              </div>
            )}

            <PDTWarning equity={equity} accountType="cash" />

            <p className="text-xs text-muted-foreground">
              {lastSyncedAt
                ? `Last reconciled with Alpaca ${new Date(lastSyncedAt).toLocaleString()}`
                : 'Waiting for the first balance sync'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

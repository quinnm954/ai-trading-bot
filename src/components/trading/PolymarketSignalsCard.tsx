import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ExternalLink, Loader2, TrendingUp, AlertTriangle, CandlestickChart } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { usePolymarketSignals, type PolymarketSignal } from '@/hooks/usePolymarketSignals';
import { PolymarketCandleChart } from './PolymarketCandleChart';

const fmtUsd = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};

export function PolymarketSignalsCard() {
  const { data: signals, isLoading, error, refetch, isFetching } = usePolymarketSignals();
  const [chartSignal, setChartSignal] = useState<PolymarketSignal | null>(null);

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Polymarket — Crypto Prediction Odds
          </CardTitle>
          <CardDescription>
            Live YES probabilities for crypto-related markets. Sharp money signal for ETF approvals, price targets, regulatory events.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading Polymarket odds…
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm py-4">
            <AlertTriangle className="w-4 h-4" />
            Failed to load Polymarket data.
          </div>
        )}

        {!isLoading && !error && signals && signals.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No active crypto prediction markets right now.
          </div>
        )}

        {!isLoading && signals && signals.length > 0 && (
          <ScrollArea className="h-[520px] pr-3">
            <div className="space-y-3">
              {signals.map((s) => {
                const yesPct = s.yes_probability != null ? Math.round(s.yes_probability * 100) : null;
                return (
                  <div
                    key={s.market_id}
                    className="rounded-lg border bg-card/50 p-3 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug">{s.question}</div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">{s.event_title}</div>
                      </div>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Open on Polymarket"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    {yesPct != null && (
                      <div className="mt-3">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">YES probability</span>
                          <span className="font-semibold">{yesPct}%</span>
                        </div>
                        <Progress value={yesPct} className="h-2" />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
                      <Badge variant="secondary">Vol {fmtUsd(s.volume)}</Badge>
                      <Badge variant="outline">Liq {fmtUsd(s.liquidity)}</Badge>
                      {s.end_date && (
                        <span className="text-muted-foreground">
                          Resolves {formatDistanceToNow(new Date(s.end_date), { addSuffix: true })}
                        </span>
                      )}
                      {s.yes_token_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7 px-2 gap-1"
                          onClick={() => setChartSignal(s)}
                        >
                          <CandlestickChart className="w-3.5 h-3.5" />
                          Candles
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>

    <Dialog open={!!chartSignal} onOpenChange={(o) => !o && setChartSignal(null)}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">{chartSignal?.question}</DialogTitle>
          <DialogDescription className="truncate">{chartSignal?.event_title}</DialogDescription>
        </DialogHeader>
        {chartSignal?.yes_token_id && (
          <PolymarketCandleChart
            tokenId={chartSignal.yes_token_id}
            outcome={chartSignal.outcomes?.find((o) => o?.toLowerCase() === 'yes') ?? chartSignal.outcomes?.[0]}
          />
        )}
      </DialogContent>
    </Dialog>
    </>
  );
}

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Play, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface Trade {
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  pnlPct: number;
  holdMinutes: number;
  reason: string;
}

interface ReplayResult {
  symbol: string;
  lookbackMinutes: number;
  barsAnalyzed: number;
  firstBar: string;
  lastBar: string;
  metrics: {
    totalTrades: number;
    winRate: number;
    totalPnlPct: number;
    avgPnlPct: number;
    maxDrawdownPct: number;
    avgHoldMinutes: number;
  };
  sampleTrades: Trade[];
}

const LOOKBACKS = [
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 360 },
  { label: '24h', minutes: 1440 },
  { label: '3d', minutes: 4320 },
  { label: '7d', minutes: 10080 },
];

export function ScalpingReplayPanel() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [lookback, setLookback] = useState(1440);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReplayResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runReplay = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('scalping-replay', {
        body: { symbol: symbol.toUpperCase().trim(), lookbackMinutes: lookback },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      setResult(data as ReplayResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="w-4 h-4 text-primary" />
            Scalping Paper Replay
          </CardTitle>
          <CardDescription>
            Replay the live scalping logic over recent Binance 1-minute klines.
            Advisory only — does not affect the bot or your paper balance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="replay-symbol">Symbol (Binance)</Label>
              <Input
                id="replay-symbol"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="BTCUSDT"
              />
            </div>
            <div className="space-y-1">
              <Label>Lookback</Label>
              <div className="flex flex-wrap gap-1">
                {LOOKBACKS.map((opt) => (
                  <Button
                    key={opt.minutes}
                    size="sm"
                    variant={lookback === opt.minutes ? 'default' : 'outline'}
                    onClick={() => setLookback(opt.minutes)}
                    type="button"
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Button onClick={runReplay} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running replay…
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run replay
              </>
            )}
          </Button>

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-3">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base">
                Results — {result.symbol} · {result.barsAnalyzed} bars
              </CardTitle>
              <CardDescription>
                {format(new Date(result.firstBar), 'MMM dd HH:mm')} →{' '}
                {format(new Date(result.lastBar), 'MMM dd HH:mm')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Metric label="Trades" value={result.metrics.totalTrades.toString()} />
                <Metric label="Win rate" value={`${result.metrics.winRate}%`} />
                <Metric
                  label="Total P&L"
                  value={`${result.metrics.totalPnlPct >= 0 ? '+' : ''}${result.metrics.totalPnlPct}%`}
                  positive={result.metrics.totalPnlPct >= 0}
                />
                <Metric
                  label="Avg P&L / trade"
                  value={`${result.metrics.avgPnlPct >= 0 ? '+' : ''}${result.metrics.avgPnlPct}%`}
                  positive={result.metrics.avgPnlPct >= 0}
                />
                <Metric
                  label="Max drawdown"
                  value={`${result.metrics.maxDrawdownPct}%`}
                  negative
                />
                <Metric label="Avg hold" value={`${result.metrics.avgHoldMinutes}m`} />
              </div>
            </CardContent>
          </Card>

          {result.sampleTrades.length > 0 && (
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-base">Last {result.sampleTrades.length} trades</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {result.sampleTrades.slice().reverse().map((t, idx) => (
                    <div
                      key={`${t.entryTime}-${idx}`}
                      className="flex items-center justify-between gap-3 p-2 rounded-md bg-muted/30 border border-border/50 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {t.pnlPct >= 0 ? (
                          <TrendingUp className="w-3 h-3 text-success shrink-0" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-destructive shrink-0" />
                        )}
                        <div className="truncate">
                          <div className="text-foreground font-mono">
                            {t.entry.toFixed(2)} → {t.exit.toFixed(2)}
                          </div>
                          <div className="text-muted-foreground">
                            {format(new Date(t.entryTime), 'MMM dd HH:mm')} · {t.holdMinutes}m
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={
                            t.pnlPct >= 0
                              ? 'font-semibold text-success'
                              : 'font-semibold text-destructive'
                          }
                        >
                          {t.pnlPct >= 0 ? '+' : ''}
                          {t.pnlPct.toFixed(2)}%
                        </span>
                        <Badge variant="outline" className="text-[10px] py-0">
                          {t.reason.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  positive,
  negative,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="p-3 rounded-md bg-muted/30 border border-border/50">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          positive
            ? 'text-lg font-bold text-success'
            : negative
              ? 'text-lg font-bold text-destructive'
              : 'text-lg font-bold text-foreground'
        }
      >
        {value}
      </p>
    </div>
  );
}

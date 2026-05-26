import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SignalScore } from '@/lib/signalScoring';
import { WEIGHTS, riskLevel } from '@/lib/signalScoring';

interface Props {
  score: SignalScore;
  symbol?: string;
  strategy?: string;
}

const LABELS: Record<keyof typeof WEIGHTS, string> = {
  trend: 'Trend Direction',
  emaAlignment: 'EMA 9/21/50',
  rsi: 'RSI',
  macd: 'MACD',
  vwap: 'VWAP',
  volume: 'Volume',
  supportResistance: 'Support/Resistance',
  volatility: 'Volatility',
  riskReward: 'Risk / Reward',
};

export function SignalScorePanel({ score, symbol, strategy }: Props) {
  const risk = riskLevel(score.total);
  const riskColor = risk === 'low' ? 'text-success' : risk === 'medium' ? 'text-warning' : 'text-loss';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base">
            Signal Score {symbol && <span className="text-muted-foreground">· {symbol}</span>}
          </CardTitle>
          {strategy && <p className="text-xs text-muted-foreground mt-1">{strategy}</p>}
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-foreground">{score.total}</div>
          <div className={cn('text-xs font-medium uppercase', riskColor)}>{risk} risk</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          {score.valid ? (
            <Badge className="bg-success text-success-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Valid Signal
            </Badge>
          ) : (
            <Badge variant="destructive" className="flex items-center gap-1">
              <XCircle className="w-3 h-3" /> Invalid
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            R/R {score.riskReward.toFixed(2)}:1
          </span>
        </div>

        <div className="space-y-1.5">
          {(Object.keys(LABELS) as Array<keyof typeof LABELS>).map((k) => {
            const pct = (score.factors[k] || 0) * 100;
            const weight = WEIGHTS[k];
            return (
              <div key={k}>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{LABELS[k]}</span>
                  <span className="text-foreground tabular-nums">
                    {pct.toFixed(0)}% <span className="text-muted-foreground">/ w{weight}</span>
                  </span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full transition-all',
                      pct >= 70 ? 'bg-success' : pct >= 40 ? 'bg-warning' : 'bg-loss',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {score.reasons.length > 0 && (
          <div className="pt-2 border-t border-border space-y-1">
            {score.reasons.slice(0, 4).map((r, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {r}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

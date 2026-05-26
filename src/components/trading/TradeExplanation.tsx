import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, Target, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TradeExplanationData {
  symbol: string;
  side: 'buy' | 'sell' | 'long' | 'short';
  action: 'entered' | 'skipped' | 'closed';
  entry: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  riskReward?: number;
  confidence?: number;     // 0..1
  score?: number;          // 0..100
  riskLevel?: 'low' | 'medium' | 'high';
  strategy?: string;
  reasoning: string;
  exitReason?: string;
}

export function TradeExplanation({ data }: { data: TradeExplanationData }) {
  const isBuy = data.side === 'buy' || data.side === 'long';
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            {isBuy ? (
              <ArrowUp className="w-4 h-4 text-success" />
            ) : (
              <ArrowDown className="w-4 h-4 text-loss" />
            )}
            {data.symbol} · {data.side.toUpperCase()}
          </span>
          <Badge
            variant={data.action === 'entered' ? 'default' : data.action === 'skipped' ? 'destructive' : 'secondary'}
          >
            {data.action}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <Row label="Entry" value={`$${data.entry.toFixed(4)}`} />
          {data.stopLoss != null && (
            <Row
              label={<><ShieldAlert className="inline w-3 h-3 mr-1" />Stop Loss</>}
              value={`$${data.stopLoss.toFixed(4)}`}
              tone="loss"
            />
          )}
          {data.takeProfit != null && (
            <Row
              label={<><Target className="inline w-3 h-3 mr-1" />Take Profit</>}
              value={`$${data.takeProfit.toFixed(4)}`}
              tone="profit"
            />
          )}
          {data.riskReward != null && (
            <Row label="Risk / Reward" value={`${data.riskReward.toFixed(2)}:1`} />
          )}
          {data.score != null && (
            <Row label="Confidence Score" value={`${Math.round(data.score)}/100`} />
          )}
          {data.confidence != null && data.score == null && (
            <Row label="Confidence" value={`${Math.round(data.confidence * 100)}%`} />
          )}
          {data.riskLevel && (
            <Row
              label="Risk Level"
              value={<span className={riskClass(data.riskLevel)}>{data.riskLevel.toUpperCase()}</span>}
            />
          )}
          {data.strategy && <Row label="Strategy" value={data.strategy} />}
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">Reasoning</p>
          <p className="text-sm text-foreground/90 whitespace-pre-line">{data.reasoning}</p>
        </div>
        {data.exitReason && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Exit Reason</p>
            <p className="text-sm text-foreground/90">{data.exitReason}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, tone }: { label: React.ReactNode; value: React.ReactNode; tone?: 'profit' | 'loss' }) {
  const c = tone === 'profit' ? 'text-success' : tone === 'loss' ? 'text-loss' : 'text-foreground';
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn('font-medium', c)}>{value}</span>
    </div>
  );
}

function riskClass(r: 'low' | 'medium' | 'high') {
  return r === 'low' ? 'text-success' : r === 'medium' ? 'text-warning' : 'text-loss';
}

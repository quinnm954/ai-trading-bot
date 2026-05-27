import { useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2 } from 'lucide-react';
import { usePolymarketCandles, type Candle } from '@/hooks/usePolymarketCandles';

interface Props {
  tokenId: string;
  outcome?: string;
}

function CandleSvg({ candles }: { candles: Candle[] }) {
  const dims = { w: 720, h: 320, pad: 32 };
  const view = useMemo(() => {
    if (!candles.length) return null;
    const min = Math.min(...candles.map(c => c.low));
    const max = Math.max(...candles.map(c => c.high));
    const pad = (max - min) * 0.1 || 0.01;
    const lo = Math.max(0, min - pad);
    const hi = Math.min(1, max + pad);
    const innerW = dims.w - dims.pad * 2;
    const innerH = dims.h - dims.pad * 2;
    const bw = Math.max(2, (innerW / candles.length) * 0.7);
    const step = innerW / candles.length;
    const y = (v: number) => dims.pad + innerH * (1 - (v - lo) / (hi - lo));
    return { lo, hi, innerW, innerH, bw, step, y };
  }, [candles]);

  if (!view) return null;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => view.lo + (view.hi - view.lo) * f);

  return (
    <svg viewBox={`0 0 ${dims.w} ${dims.h}`} className="w-full h-auto">
      {/* grid + y labels */}
      {gridLines.map((g, i) => (
        <g key={i}>
          <line
            x1={dims.pad} x2={dims.w - dims.pad}
            y1={view.y(g)} y2={view.y(g)}
            stroke="hsl(var(--border))" strokeDasharray="2 4" strokeWidth={0.5}
          />
          <text
            x={4} y={view.y(g) + 3}
            fontSize={10} fill="hsl(var(--muted-foreground))"
          >
            {(g * 100).toFixed(0)}¢
          </text>
        </g>
      ))}

      {candles.map((c, i) => {
        const cx = dims.pad + view.step * i + view.step / 2;
        const up = c.close >= c.open;
        const color = up ? 'hsl(142 76% 45%)' : 'hsl(0 72% 55%)';
        const yOpen = view.y(c.open);
        const yClose = view.y(c.close);
        const top = Math.min(yOpen, yClose);
        const bodyH = Math.max(1, Math.abs(yClose - yOpen));
        return (
          <g key={c.t}>
            <line
              x1={cx} x2={cx}
              y1={view.y(c.high)} y2={view.y(c.low)}
              stroke={color} strokeWidth={1}
            />
            <rect
              x={cx - view.bw / 2} y={top}
              width={view.bw} height={bodyH}
              fill={color}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function PolymarketCandleChart({ tokenId, outcome }: Props) {
  const [fidelity, setFidelity] = useState<5 | 15>(5);
  const { data: candles, isLoading, error } = usePolymarketCandles(tokenId, fidelity, '1w');

  const latest = candles?.[candles.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Outcome:</span>{' '}
          <span className="font-semibold">{outcome ?? 'YES'}</span>
          {latest && (
            <span className="ml-3 text-muted-foreground">
              Last: <span className="font-semibold text-foreground">{(latest.close * 100).toFixed(1)}¢</span>
            </span>
          )}
        </div>
        <Tabs value={String(fidelity)} onValueChange={(v) => setFidelity(Number(v) as 5 | 15)}>
          <TabsList>
            <TabsTrigger value="5">5m</TabsTrigger>
            <TabsTrigger value="15">15m</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="rounded-lg border bg-card/50 p-2 min-h-[340px] flex items-center justify-center">
        {isLoading && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
        {error && <div className="text-sm text-destructive">Failed to load candles</div>}
        {!isLoading && !error && candles && candles.length === 0 && (
          <div className="text-sm text-muted-foreground">No trades in this window yet.</div>
        )}
        {!isLoading && candles && candles.length > 0 && <CandleSvg candles={candles} />}
      </div>

      <div className="text-xs text-muted-foreground">
        Candles built from Polymarket CLOB trade history. {candles?.length ?? 0} bars · {fidelity}-minute interval.
      </div>
    </div>
  );
}

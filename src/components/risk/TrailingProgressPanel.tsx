import { useEffect, useState } from 'react';
import { TrendingUp, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { WIDE_TRAIL_ARM_PCT, WIDE_TRAIL_DROP_PCT, WIDE_MAX_HOLD_MINUTES } from '@/lib/exitGeometry';

interface Row {
  id: string;
  symbol: string;
  pnlPct: number;
  peakPct: number;
  armed: boolean;
  dropFromPeak: number;
  exitAtPct: number;
}

export function TrailingProgressPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase
        .from('positions')
        .select('id, symbol, avg_entry_price, current_price, peak_pnl_percent, max_hold_minutes, side')
        .eq('user_id', user.id);

      if (cancelled) return;

      const mapped: Row[] = (data ?? [])
        .filter((p: any) => Number(p.max_hold_minutes) >= WIDE_MAX_HOLD_MINUTES)
        .map((p: any) => {
          const entry = Number(p.avg_entry_price) || 0;
          const now = Number(p.current_price) || entry;
          const pnlPct = entry > 0
            ? (p.side === 'sell' ? ((entry - now) / entry) * 100 : ((now - entry) / entry) * 100)
            : 0;
          const peakPct = Math.max(Number(p.peak_pnl_percent) || 0, pnlPct);
          return {
            id: p.id,
            symbol: p.symbol,
            pnlPct,
            peakPct,
            armed: peakPct >= WIDE_TRAIL_ARM_PCT,
            dropFromPeak: peakPct - pnlPct,
            exitAtPct: peakPct - WIDE_TRAIL_DROP_PCT,
          };
        })
        .sort((a, b) => b.peakPct - a.peakPct);

      setRows(mapped);
    };

    load();
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user]);

  if (!rows) {
    return (
      <div className="glass-panel p-6 flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-primary/20">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-foreground">Trailing progress (wide-stop swings)</h3>
          <p className="text-xs text-muted-foreground">
            Arms at +{WIDE_TRAIL_ARM_PCT.toFixed(1)}% peak, then exits on a {WIDE_TRAIL_DROP_PCT.toFixed(1)}% giveback.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open wide-stop swings right now.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const progress = Math.min(100, Math.max(0, (r.peakPct / WIDE_TRAIL_ARM_PCT) * 100));
            const givebackProgress = Math.min(100, Math.max(0, (r.dropFromPeak / WIDE_TRAIL_DROP_PCT) * 100));
            return (
              <div key={r.id} className="p-3 rounded-lg border border-border/40 bg-secondary/30">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-foreground">{r.symbol}</span>
                  <span className={cn('font-mono', r.pnlPct >= 0 ? 'text-success' : 'text-destructive')}>
                    {r.pnlPct >= 0 ? '+' : ''}{r.pnlPct.toFixed(2)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', r.armed ? 'bg-success' : 'bg-primary')}
                    style={{ width: `${r.armed ? givebackProgress : progress}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground font-mono">
                  peak +{r.peakPct.toFixed(2)}% ·{' '}
                  {r.armed
                    ? `ARMED — trailing exit at +${r.exitAtPct.toFixed(2)}% (gave back ${r.dropFromPeak.toFixed(2)}% of ${WIDE_TRAIL_DROP_PCT.toFixed(1)}%)`
                    : `not armed — needs +${(WIDE_TRAIL_ARM_PCT - r.peakPct).toFixed(2)}% more peak`}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

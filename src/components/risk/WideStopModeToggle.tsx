import { useEffect, useState } from 'react';
import { Waves, Info, Loader2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  WIDE_TP_GROSS_PCT,
  WIDE_STOP_ATR_MULT,
  WIDE_STOP_MIN_PCT,
  WIDE_STOP_MAX_PCT,
  WIDE_MAX_HOLD_MINUTES,
} from '@/lib/exitGeometry';

/**
 * Wide-stop swing mode.
 *
 * The locked 3.36% / 0.80% geometry stops out on roughly two thirds of swings because
 * 0.80% sits inside one bar of noise. Wide mode swaps in an 8% target with an ATR-scaled
 * stop and a 48h hold for entries taken while the aggregate tape gate is open — the gate
 * already stands the whole cycle down when the tape is flat or falling, so the wide
 * geometry only ever runs in the regime it tested positive in.
 */
export function WideStopModeToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;

    (async () => {
      const { data } = await supabase
        .from('scalp_settings')
        .select('wide_stop_mode')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      setEnabled(data?.wide_stop_mode === true);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [user]);

  const save = async (value: boolean) => {
    if (!user) return;
    setSaving(true);
    setEnabled(value);
    const { error } = await supabase
      .from('scalp_settings')
      .update({ wide_stop_mode: value })
      .eq('user_id', user.id);
    setSaving(false);

    if (error) {
      setEnabled(!value);
      toast({
        title: 'Could not save',
        description: error.message,
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: value ? 'Wide-stop swing mode on' : 'Standard geometry restored',
      description: value
        ? `New entries use +${WIDE_TP_GROSS_PCT}% target, ${WIDE_STOP_ATR_MULT}×ATR stop and a ${WIDE_MAX_HOLD_MINUTES / 60}h hold while the tape gate is open.`
        : 'New entries use the enforced +3.36% / −0.80% geometry again.',
    });
  };

  return (
    <div className="p-4 rounded-lg border border-border/60 bg-card/40 mb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Waves className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Wide-stop swing mode</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="About wide-stop swing mode">
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-xs">
                  Trades opened while the aggregate tape gate is open use a +
                  {WIDE_TP_GROSS_PCT}% target, a stop of {WIDE_STOP_ATR_MULT}×ATR (clamped{' '}
                  {WIDE_STOP_MIN_PCT}%–{WIDE_STOP_MAX_PCT}%), a{' '}
                  {WIDE_MAX_HOLD_MINUTES / 60}h hold and no trailing stop. When the tape is
                  flat or falling the engine stands down entirely instead of trading.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={enabled} disabled={saving} onCheckedChange={save} />
        )}
      </div>

      {!loading && (
        <p className="mt-2 text-xs text-muted-foreground">
          {enabled ? (
            <>
              Active: +{WIDE_TP_GROSS_PCT}% target · {WIDE_STOP_ATR_MULT}×ATR stop (
              {WIDE_STOP_MIN_PCT}–{WIDE_STOP_MAX_PCT}%) · {WIDE_MAX_HOLD_MINUTES / 60}h hold ·
              trailing off · entries only while the tape gate is open, otherwise stand down.
            </>
          ) : (
            <>
              Off: entries use the enforced +3.36% / −0.80% geometry with a 12–24h hold.
              Backtested wide mode was positive only in rising tape, so risk per trade is
              larger when on.
            </>
          )}
        </p>
      )}
    </div>
  );
}

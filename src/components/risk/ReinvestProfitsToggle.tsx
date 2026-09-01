import { useEffect, useState } from 'react';
import { PiggyBank, Info, Loader2 } from 'lucide-react';
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

/**
 * Capital basis control.
 *
 * When reinvesting is OFF (the default), every sizing and exposure check measures
 * against the initial deposit instead of grown equity, so realized profits pile up
 * as idle cash and are never put back at risk.
 */
export function ReinvestProfitsToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [initialDeposit, setInitialDeposit] = useState<number | null>(null);
  const [equity, setEquity] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;

    (async () => {
      const [{ data: ai }, { data: paper }] = await Promise.all([
        supabase
          .from('ai_settings')
          .select('reinvest_profits, trading_mode, live_initial_investment')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('paper_account')
          .select('balance, initial_balance')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (!active) return;

      setEnabled(ai?.reinvest_profits === true);

      if (ai?.trading_mode === 'live') {
        setInitialDeposit(Number(ai?.live_initial_investment) || 0);
        const { data: live } = await supabase
          .from('live_account')
          .select('equity')
          .eq('user_id', user.id)
          .maybeSingle();
        if (active) setEquity(Number(live?.equity) || 0);
      } else {
        setInitialDeposit(Number(paper?.initial_balance) || 0);
        setEquity(Number(paper?.balance) || 0);
      }
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
      .from('ai_settings')
      .update({ reinvest_profits: value })
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
      title: value ? 'Reinvesting profits enabled' : 'Profits kept separate',
      description: value
        ? 'Position sizing now uses your full account equity, so profits compound.'
        : 'Position sizing uses your initial deposit only. Profits stay parked as cash.',
    });
  };

  const heldAside =
    initialDeposit !== null && equity !== null ? Math.max(0, equity - initialDeposit) : 0;

  return (
    <div className="p-4 rounded-lg border border-border/60 bg-card/40 mb-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <PiggyBank className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">Reinvest profits</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="About reinvesting profits">
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs text-xs">
                  Off (recommended): the bots size trades off your initial deposit only, so
                  realized profit is never put back at risk. On: sizing uses full equity and
                  profits compound.
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
            <>Trading capital: full equity — profits compound into larger positions.</>
          ) : (
            <>
              Trading capital: initial deposit of{' '}
              <span className="text-foreground font-medium">
                ${(initialDeposit ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
              {heldAside > 0 && (
                <>
                  {' '}· held aside as profit:{' '}
                  <span className="text-success font-medium">
                    ${heldAside.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </>
              )}
            </>
          )}
        </p>
      )}
    </div>
  );
}

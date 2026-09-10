import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Mirror mode: with an explicit risk acknowledgement, copied trades follow the
 * trader's own entries and exits instead of the app's stop/target contract.
 * The amount staked is still limited by the same risk sizing rules.
 */
export function CopyTradeMirrorToggle() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setLoading(false);
      const { data } = await supabase
        .from('copy_trading_settings')
        .select('risk_acknowledged')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (!active) return;
      setAcknowledged(!!data?.risk_acknowledged);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const save = async (next: boolean) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    setSaving(true);
    const { error } = await supabase
      .from('copy_trading_settings')
      .upsert({
        user_id: auth.user.id,
        risk_acknowledged: next,
        risk_acknowledged_at: next ? new Date().toISOString() : null,
      }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      toast.error('Could not save that setting');
      return;
    }
    setAcknowledged(next);
    toast.success(next ? 'Mirror mode on — copies follow the trader' : 'Mirror mode off — copies use your risk exits');
  };

  return (
    <Card className="bg-card/50 border-amber-500/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              {acknowledged
                ? <AlertTriangle className="w-5 h-5 text-amber-400" />
                : <ShieldCheck className="w-5 h-5 text-primary" />}
              Mirror the trader exactly
            </CardTitle>
            <CardDescription>
              Copies follow the trader's own buys and sells — your stop-loss, profit
              target and time limit do not apply to them.
            </CardDescription>
          </div>
          <Switch checked={acknowledged} disabled={loading || saving} onCheckedChange={save} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          The amount put into each copied trade is still limited by your normal
          rules: your copy percentage, the per-copy cap, your maximum position
          size and how many copies can run at once.
        </p>
        <Badge variant="outline" className={acknowledged ? 'border-amber-500/50 text-amber-400' : 'border-primary/50 text-primary'}>
          {acknowledged
            ? 'Risk acknowledged — a copied trade can lose more than your usual limit'
            : 'Protected — copies exit on your own stop and target'}
        </Badge>
      </CardContent>
    </Card>
  );
}

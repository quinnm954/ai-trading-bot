import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type Cfg = {
  enabled: boolean;
  auto_copy: boolean;
  copy_percentage: number;
  max_copy_amount_usd: number;
  max_concurrent_copies: number;
  min_trader_win_rate: number;
  min_trader_trades: number;
};

const DEFAULTS: Cfg = {
  enabled: false,
  auto_copy: false,
  copy_percentage: 10,
  max_copy_amount_usd: 100,
  max_concurrent_copies: 5,
  min_trader_win_rate: 55,
  min_trader_trades: 20,
};

/**
 * Master on/off plus the sizing and trader-quality limits the copy executor
 * reads every 5 minutes. Without `enabled` AND `auto_copy` the executor skips
 * the user entirely, so both are driven by the single switch here.
 */
export function CopyTradingSettingsCard() {
  const [cfg, setCfg] = useState<Cfg>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return setLoading(false);
      const { data } = await supabase
        .from('copy_trading_settings')
        .select('enabled, auto_copy, copy_percentage, max_copy_amount_usd, max_concurrent_copies, min_trader_win_rate, min_trader_trades')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (!active) return;
      if (data) {
        setCfg({
          enabled: !!data.enabled,
          auto_copy: data.auto_copy ?? true,
          copy_percentage: Number(data.copy_percentage ?? DEFAULTS.copy_percentage),
          max_copy_amount_usd: Number(data.max_copy_amount_usd ?? DEFAULTS.max_copy_amount_usd),
          max_concurrent_copies: Number(data.max_concurrent_copies ?? DEFAULTS.max_concurrent_copies),
          min_trader_win_rate: Number(data.min_trader_win_rate ?? DEFAULTS.min_trader_win_rate),
          min_trader_trades: Number(data.min_trader_trades ?? DEFAULTS.min_trader_trades),
        });
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const persist = async (next: Cfg) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return false;
    setSaving(true);
    const { error } = await supabase
      .from('copy_trading_settings')
      .upsert({
        user_id: auth.user.id,
        enabled: next.enabled,
        auto_copy: next.enabled ? true : next.auto_copy,
        copy_percentage: next.copy_percentage,
        max_copy_amount_usd: next.max_copy_amount_usd,
        max_concurrent_copies: next.max_concurrent_copies,
        min_trader_win_rate: next.min_trader_win_rate,
        min_trader_trades: next.min_trader_trades,
      }, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      toast.error('Could not save copy trading settings');
      return false;
    }
    return true;
  };

  const toggle = async (on: boolean) => {
    const next = { ...cfg, enabled: on, auto_copy: on ? true : cfg.auto_copy };
    if (await persist(next)) {
      setCfg(next);
      toast.success(on ? 'Copy trading is on — trades copy automatically' : 'Copy trading is off');
    }
  };

  const num = (key: keyof Cfg) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCfg({ ...cfg, [key]: Number(e.target.value) } as Cfg);

  return (
    <Card className={cfg.enabled ? 'bg-card/50 border-primary/40' : 'bg-card/50'}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Copy className="w-5 h-5 text-primary" />
              Copy trading
            </CardTitle>
            <CardDescription>
              When this is on, the traders you follow are the only source of new buys,
              checked every 5 minutes. Your own trading stays out of the way.
            </CardDescription>
          </div>
          <Switch checked={cfg.enabled} disabled={loading || saving} onCheckedChange={toggle} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Badge variant="outline" className={cfg.enabled ? 'border-primary/50 text-primary' : 'text-muted-foreground'}>
          {cfg.enabled ? 'Active — copying only' : 'Off — nothing is being copied'}
        </Badge>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="copy-cap">Fallback amount if a trader's size is unknown ($)</Label>
            <Input id="copy-cap" type="number" min={5} value={cfg.max_copy_amount_usd} onChange={num('max_copy_amount_usd')} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Every copied trade uses the same amount the trader used, as long as you have
          the cash. None of your safety limits are applied to copied trades, and a
          copied trade closes only when the trader closes it.
        </p>


        <Button
          onClick={async () => { if (await persist(cfg)) toast.success('Copy trading settings saved'); }}
          disabled={loading || saving}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
  );
}

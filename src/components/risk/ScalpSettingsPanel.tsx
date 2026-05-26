import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Zap, Target, RefreshCw, Layers } from 'lucide-react';

type Preset = 'conservative' | 'balanced' | 'aggressive' | 'custom';

interface ScalpSettings {
  preset: Preset;
  entry_min_5m_pct: number;
  entry_min_15m_pct: number;
  entry_min_1h_pct: number;
  entry_min_24h_pct: number;
  reentry_breakout_pct: number;
  chase_guard_minutes: number;
  take_profit_pct: number;
  trailing_drop_pct: number;
  hard_stop_loss_pct: number;
  momentum_rotation_min_pct: number;
  loss_rotation_enabled: boolean;
  loss_rotation_max_loss_pct: number;
  loss_rotation_momentum_edge_pct: number;
  loss_rotation_min_age_sec: number;
  loss_rotation_cooldown_sec: number;
  max_concurrent_positions: number;
  target_position_size_usd: number;
  max_capital_usage_pct: number;
}

const DEFAULTS: ScalpSettings = {
  preset: 'balanced',
  entry_min_5m_pct: 0.3, entry_min_15m_pct: 0.2, entry_min_1h_pct: 0.3, entry_min_24h_pct: 0.3,
  reentry_breakout_pct: 0.25, chase_guard_minutes: 120,
  take_profit_pct: 1.0, trailing_drop_pct: 1.5, hard_stop_loss_pct: 3.0, momentum_rotation_min_pct: 0.5,
  loss_rotation_enabled: true, loss_rotation_max_loss_pct: -2.0, loss_rotation_momentum_edge_pct: 0.5,
  loss_rotation_min_age_sec: 300, loss_rotation_cooldown_sec: 60,
  max_concurrent_positions: 12, target_position_size_usd: 50, max_capital_usage_pct: 80,
};

const PRESETS: Record<Exclude<Preset, 'custom'>, Partial<ScalpSettings>> = {
  conservative: {
    entry_min_5m_pct: 0.5, entry_min_1h_pct: 0.5, take_profit_pct: 1.5, trailing_drop_pct: 1.0,
    hard_stop_loss_pct: 2.0, loss_rotation_max_loss_pct: -1.0,
    max_concurrent_positions: 6, target_position_size_usd: 25, max_capital_usage_pct: 60,
  },
  balanced: {
    entry_min_5m_pct: 0.3, entry_min_1h_pct: 0.3, take_profit_pct: 1.0, trailing_drop_pct: 1.5,
    hard_stop_loss_pct: 3.0, loss_rotation_max_loss_pct: -2.0,
    max_concurrent_positions: 12, target_position_size_usd: 50, max_capital_usage_pct: 80,
  },
  aggressive: {
    entry_min_5m_pct: 0.15, entry_min_1h_pct: 0.15, take_profit_pct: 0.6, trailing_drop_pct: 2.0,
    hard_stop_loss_pct: 4.0, loss_rotation_max_loss_pct: -3.0,
    max_concurrent_positions: 20, target_position_size_usd: 100, max_capital_usage_pct: 95,
  },
};

function SliderRow({ label, value, min, max, step, suffix, onChange }: {
  label: string; value: number; min: number; max: number; step: number; suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <Label className="text-muted-foreground">{label}</Label>
        <span className="font-mono text-foreground">{value}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

export function ScalpSettingsPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [s, setS] = useState<ScalpSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('scalp_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (data) setS({ ...DEFAULTS, ...data } as ScalpSettings);
      setLoading(false);
    })();
  }, [user]);

  const update = <K extends keyof ScalpSettings>(k: K, v: ScalpSettings[K]) =>
    setS(prev => ({ ...prev, [k]: v, preset: 'custom' }));

  const applyPreset = (p: Exclude<Preset, 'custom'>) =>
    setS(prev => ({ ...prev, ...PRESETS[p], preset: p }));

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from('scalp_settings').upsert(
      { user_id: user.id, ...s, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    setSaving(false);
    toast(error
      ? { title: 'Save failed', description: error.message, variant: 'destructive' }
      : { title: 'Scalp settings saved', description: 'Engine will use these on the next run.' });
  };

  if (loading) return <Card className="glass-panel"><CardContent className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;

  return (
    <Card className="glass-panel">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Scalp Settings
            </CardTitle>
            <CardDescription>Tune entry, exit, loss-rotation and sizing for the scalping engine.</CardDescription>
          </div>
          <Badge variant={s.preset === 'custom' ? 'secondary' : 'default'} className="capitalize shrink-0">{s.preset}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-2">
          {(['conservative', 'balanced', 'aggressive'] as const).map(p => (
            <Button key={p} variant={s.preset === p ? 'default' : 'outline'} size="sm" onClick={() => applyPreset(p)} className="capitalize">{p}</Button>
          ))}
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2"><Target className="w-4 h-4 text-primary" />Entry momentum thresholds</h4>
          <SliderRow label="Min 5m change" value={s.entry_min_5m_pct} min={0} max={2} step={0.05} suffix="%" onChange={v => update('entry_min_5m_pct', v)} />
          <SliderRow label="Min 1h change" value={s.entry_min_1h_pct} min={0} max={2} step={0.05} suffix="%" onChange={v => update('entry_min_1h_pct', v)} />
          <SliderRow label="Min 24h change" value={s.entry_min_24h_pct} min={0} max={5} step={0.1} suffix="%" onChange={v => update('entry_min_24h_pct', v)} />
          <SliderRow label="Re-entry breakout above last exit" value={s.reentry_breakout_pct} min={0} max={2} step={0.05} suffix="%" onChange={v => update('reentry_breakout_pct', v)} />
          <SliderRow label="Chase-guard window" value={s.chase_guard_minutes} min={0} max={360} step={5} suffix=" min" onChange={v => update('chase_guard_minutes', v)} />
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="w-4 h-4 text-primary" />Exit / trailing stop</h4>
          <SliderRow label="Take-profit (arms trailing)" value={s.take_profit_pct} min={0.2} max={5} step={0.1} suffix="%" onChange={v => update('take_profit_pct', v)} />
          <SliderRow label="Trailing drop from peak" value={s.trailing_drop_pct} min={0.2} max={5} step={0.1} suffix="%" onChange={v => update('trailing_drop_pct', v)} />
          <SliderRow label="Hard stop-loss" value={s.hard_stop_loss_pct} min={0.5} max={10} step={0.1} suffix="%" onChange={v => update('hard_stop_loss_pct', v)} />
          <SliderRow label="Momentum rotation threshold" value={s.momentum_rotation_min_pct} min={0.1} max={5} step={0.1} suffix="%" onChange={v => update('momentum_rotation_min_pct', v)} />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="w-4 h-4 text-warning" />Loss rotation</h4>
            <Switch checked={s.loss_rotation_enabled} onCheckedChange={v => update('loss_rotation_enabled', v)} />
          </div>
          {s.loss_rotation_enabled && (
            <>
              <SliderRow label="Max realized loss per swap" value={s.loss_rotation_max_loss_pct} min={-10} max={0} step={0.25} suffix="%" onChange={v => update('loss_rotation_max_loss_pct', v)} />
              <SliderRow label="Momentum edge required" value={s.loss_rotation_momentum_edge_pct} min={0} max={3} step={0.1} suffix="%" onChange={v => update('loss_rotation_momentum_edge_pct', v)} />
              <SliderRow label="Min position age before swap" value={s.loss_rotation_min_age_sec} min={0} max={1800} step={30} suffix=" sec" onChange={v => update('loss_rotation_min_age_sec', v)} />
              <SliderRow label="Cooldown between swaps" value={s.loss_rotation_cooldown_sec} min={0} max={600} step={10} suffix=" sec" onChange={v => update('loss_rotation_cooldown_sec', v)} />
            </>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold flex items-center gap-2"><Layers className="w-4 h-4 text-primary" />Sizing & slots</h4>
          <SliderRow label="Max concurrent positions" value={s.max_concurrent_positions} min={1} max={30} step={1} suffix="" onChange={v => update('max_concurrent_positions', v)} />
          <SliderRow label="Target position size" value={s.target_position_size_usd} min={5} max={500} step={5} suffix=" USD" onChange={v => update('target_position_size_usd', v)} />
          <SliderRow label="Max capital usage" value={s.max_capital_usage_pct} min={10} max={100} step={5} suffix="%" onChange={v => update('max_capital_usage_pct', v)} />
        </div>

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save scalp settings
        </Button>
      </CardContent>
    </Card>
  );
}

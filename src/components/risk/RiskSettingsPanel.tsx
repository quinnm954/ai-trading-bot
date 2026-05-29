import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, Save, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useRiskManager } from '@/hooks/useRiskManager';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// =============================================================================
// Risk Settings Panel — single unified adjustment list
// Manages both ai_settings (risk limits) and scalp_settings (engine tuning).
// =============================================================================

type RiskTolerance = 'conservative' | 'moderate' | 'aggressive' | 'ultra_aggressive';

const RISK_PRESETS: Record<RiskTolerance, Record<string, number>> = {
  conservative:   { maxPositionSize: 5,  maxDailyLoss: 3,  weeklyLossLimit: 10, maxDrawdown: 20, maxConcurrentTrades: 5,  maxCapitalUsage: 50, maxLeverage: 1,
                    take_profit_pct: 1.5, trailing_drop_pct: 1.0, hard_stop_loss_pct: 2.0,
                    entry_min_5m_pct: 0.5, entry_min_1h_pct: 0.5, entry_min_24h_pct: 0.5 },
  moderate:       { maxPositionSize: 10, maxDailyLoss: 5,  weeklyLossLimit: 12, maxDrawdown: 25, maxConcurrentTrades: 8,  maxCapitalUsage: 70, maxLeverage: 1,
                    take_profit_pct: 1.0, trailing_drop_pct: 1.5, hard_stop_loss_pct: 3.0,
                    entry_min_5m_pct: 0.3, entry_min_1h_pct: 0.3, entry_min_24h_pct: 0.3 },
  aggressive:     { maxPositionSize: 20, maxDailyLoss: 8,  weeklyLossLimit: 18, maxDrawdown: 30, maxConcurrentTrades: 12, maxCapitalUsage: 85, maxLeverage: 2,
                    take_profit_pct: 0.8, trailing_drop_pct: 1.8, hard_stop_loss_pct: 3.5,
                    entry_min_5m_pct: 0.2, entry_min_1h_pct: 0.2, entry_min_24h_pct: 0.2 },
  ultra_aggressive:{ maxPositionSize: 30, maxDailyLoss: 10, weeklyLossLimit: 25, maxDrawdown: 40, maxConcurrentTrades: 20, maxCapitalUsage: 95, maxLeverage: 3,
                    take_profit_pct: 0.6, trailing_drop_pct: 2.0, hard_stop_loss_pct: 4.0,
                    entry_min_5m_pct: 0.15, entry_min_1h_pct: 0.15, entry_min_24h_pct: 0.15 },
};

// Keys that belong to ai_settings (via useRiskManager.updateRiskSettings)
const AI_KEYS = new Set([
  'maxPositionSize', 'maxDailyLoss', 'weeklyLossLimit', 'maxDrawdown',
  'maxConcurrentTrades', 'maxCapitalUsage', 'maxLeverage', 'riskTolerance',
]);

// Defaults for scalp_settings fields
const SCALP_DEFAULTS = {
  entry_min_5m_pct: 0.3,
  entry_min_1h_pct: 0.3,
  entry_min_24h_pct: 0.3,
  take_profit_pct: 1.0,
  trailing_drop_pct: 1.5,
  hard_stop_loss_pct: 3.0,
  loss_rotation_enabled: true,
  loss_rotation_max_loss_pct: -2.0,
  target_position_size_usd: 50,
};

type ScalpRow = typeof SCALP_DEFAULTS;

export function RiskSettingsPanel() {
  const { user } = useAuth();
  const { riskStatus, updateRiskSettings, isLoading } = useRiskManager();
  const { toast } = useToast();

  const [scalp, setScalp] = useState<ScalpRow>(SCALP_DEFAULTS);
  const [scalpLoaded, setScalpLoaded] = useState(false);
  const [pending, setPending] = useState<Record<string, any>>({});
  const [selectedPreset, setSelectedPreset] = useState<RiskTolerance | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load scalp settings
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('scalp_settings').select('*').eq('user_id', user.id).maybeSingle();
      if (data) setScalp(prev => ({ ...prev, ...data } as ScalpRow));
      setScalpLoaded(true);
    })();
  }, [user]);

  useEffect(() => {
    if (riskStatus?.settings?.riskTolerance) setSelectedPreset(riskStatus.settings.riskTolerance);
  }, [riskStatus?.settings?.riskTolerance]);

  if (isLoading || !riskStatus || !scalpLoaded) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const getValue = (key: string): any => {
    if (pending[key] !== undefined) return pending[key];
    if (AI_KEYS.has(key)) {
      return (riskStatus.settings as any)[key] ?? (key === 'riskTolerance' ? 'moderate' : 0);
    }
    return (scalp as any)[key];
  };

  const setValue = (key: string, value: any) => {
    setPending(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (preset: RiskTolerance) => {
    setSelectedPreset(preset);
    setPending({ ...RISK_PRESETS[preset], riskTolerance: preset });
  };

  const save = async () => {
    if (Object.keys(pending).length === 0 || !user) return;
    setIsSaving(true);

    const aiUpdate: Record<string, any> = {};
    const scalpUpdate: Record<string, any> = {};
    for (const [k, v] of Object.entries(pending)) {
      if (AI_KEYS.has(k)) aiUpdate[k] = v;
      else scalpUpdate[k] = v;
    }

    let ok = true;
    if (Object.keys(aiUpdate).length) {
      ok = await updateRiskSettings(aiUpdate as any);
    }
    if (ok && Object.keys(scalpUpdate).length) {
      const { error } = await supabase.from('scalp_settings').upsert(
        { user_id: user.id, ...scalp, ...scalpUpdate, updated_at: new Date().toISOString() } as never,
        { onConflict: 'user_id' }
      );
      if (error) ok = false;
      else setScalp(prev => ({ ...prev, ...scalpUpdate }));
    }

    setIsSaving(false);
    if (ok) {
      toast({ title: 'Settings saved', description: 'Engine will use these on the next run.' });
      setPending({});
    } else {
      toast({ title: 'Save failed', description: 'Could not update settings.', variant: 'destructive' });
    }
  };

  const hasChanges = Object.keys(pending).length > 0;

  const Row = ({
    label, description, settingKey, min, max, step = 1, unit = '%', warn,
  }: {
    label: string; description: string; settingKey: string;
    min: number; max: number; step?: number; unit?: string; warn?: number;
  }) => {
    const value = getValue(settingKey);
    const isUnsafe = warn !== undefined && value > warn;
    const dirty = pending[settingKey] !== undefined;
    return (
      <div className="space-y-2 py-3 border-b border-border/40 last:border-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></button>
                </TooltipTrigger>
                <TooltipContent><p className="max-w-xs text-xs">{description}</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isUnsafe && (
              <span className="flex items-center gap-1 text-xs text-warning">
                <AlertTriangle className="w-3 h-3" /> High risk
              </span>
            )}
          </div>
          <span className={cn(
            'font-mono font-medium text-sm',
            isUnsafe ? 'text-warning' : 'text-foreground',
            dirty && 'text-primary',
          )}>{value}{unit}</span>
        </div>
        <Slider
          value={[value]}
          onValueChange={([v]) => setValue(settingKey, v)}
          min={min} max={max} step={step}
          className={cn('w-full', isUnsafe && '[&>span>span]:bg-warning')}
        />
      </div>
    );
  };

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/20">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Risk & Engine Settings</h3>
            <p className="text-sm text-muted-foreground">Every parameter that shapes how the bots trade.</p>
          </div>
        </div>
        {hasChanges && (
          <Button onClick={save} disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save changes
          </Button>
        )}
      </div>

      {/* Presets */}
      <div className="space-y-2 mb-2">
        <span className="text-sm font-medium text-foreground">Risk tolerance preset</span>
        <div className="grid grid-cols-4 gap-2">
          {(['conservative', 'moderate', 'aggressive', 'ultra_aggressive'] as RiskTolerance[]).map((level) => (
            <button
              key={level}
              onClick={() => applyPreset(level)}
              className={cn(
                'px-3 py-2 rounded-lg text-xs font-medium transition-all capitalize',
                selectedPreset === level
                  ? level === 'conservative' ? 'bg-success/20 text-success border border-success/30'
                  : level === 'moderate' ? 'bg-primary/20 text-primary border border-primary/30'
                  : level === 'aggressive' ? 'bg-warning/20 text-warning border border-warning/30'
                  : 'bg-destructive/20 text-destructive border border-destructive/30'
                  : 'bg-secondary/50 text-muted-foreground hover:bg-secondary'
              )}
            >
              {level.replace('_', ' ')}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Picking a preset fills every slider below. Adjust any value to fine-tune.
        </p>
      </div>

      {/* Single unified adjustment list */}
      <div className="mt-4">
        <Row label="Max position size" description="Maximum percentage of equity allocated to a single position." settingKey="maxPositionSize" min={1} max={50} warn={25} />
        <Row label="Max daily loss" description="Trading stops for the day if losses reach this percentage." settingKey="maxDailyLoss" min={1} max={20} warn={10} />
        <Row label="Max weekly loss" description="Trading stops for the week at this loss percentage." settingKey="weeklyLossLimit" min={3} max={30} warn={15} />
        <Row label="Max drawdown (kill switch)" description="Kill switch trips when drawdown from peak equity hits this." settingKey="maxDrawdown" min={5} max={50} warn={30} />
        <Row label="Max capital usage" description="Total deployable capital across all open positions." settingKey="maxCapitalUsage" min={10} max={100} step={5} warn={90} />
        <Row label="Max concurrent trades" description="Maximum simultaneous open AI positions." settingKey="maxConcurrentTrades" min={1} max={20} unit="" />
        <Row label="Max leverage" description="Maximum leverage. 1x is spot. Amplifies gains and losses." settingKey="maxLeverage" min={1} max={10} unit="x" warn={2} />

        <Row label="Take-profit (arms trailing)" description="Profit % at which the trailing stop activates." settingKey="take_profit_pct" min={0.2} max={5} step={0.1} />
        <Row label="Trailing drop from peak" description="Once armed, exit when price drops this % from peak." settingKey="trailing_drop_pct" min={0.2} max={5} step={0.1} />
        <Row label="Hard stop-loss" description="Emergency exit if loss exceeds this %." settingKey="hard_stop_loss_pct" min={0.5} max={10} step={0.1} warn={5} />

        <Row label="Min 5m momentum to enter" description="Skip entries with weaker 5-minute momentum." settingKey="entry_min_5m_pct" min={0} max={2} step={0.05} />
        <Row label="Min 1h momentum to enter" description="Skip entries with weaker 1-hour momentum." settingKey="entry_min_1h_pct" min={0} max={2} step={0.05} />
        <Row label="Min 24h momentum to enter" description="Skip entries with weaker 24-hour momentum." settingKey="entry_min_24h_pct" min={0} max={5} step={0.1} />

        <Row label="Target scalp position size" description="Default scalp position size in USD." settingKey="target_position_size_usd" min={10} max={1000} step={10} unit=" USD" />

        {/* Loss rotation toggle + threshold */}
        <div className="flex items-center justify-between py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Loss rotation</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></button>
                </TooltipTrigger>
                <TooltipContent><p className="max-w-xs text-xs">Swap losing positions for stronger momentum opportunities.</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Switch
            checked={getValue('loss_rotation_enabled')}
            onCheckedChange={(v) => setValue('loss_rotation_enabled', v)}
          />
        </div>
        {getValue('loss_rotation_enabled') && (
          <Row label="Max realized loss per swap" description="Maximum acceptable realized loss when rotating out of a position." settingKey="loss_rotation_max_loss_pct" min={-10} max={0} step={0.25} />
        )}
      </div>

      <div className="mt-6 p-4 rounded-lg bg-muted/50">
        <p className="text-xs text-muted-foreground">
          <strong>Tip:</strong> Start with Conservative or Moderate until you trust the system on paper.
          Higher profiles raise both upside and drawdown.
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import {
  Shield,
  AlertTriangle,
  Save,
  Loader2,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useRiskManager } from '@/hooks/useRiskManager';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// =============================================================================
// Risk Settings Panel - Configure risk management parameters
// =============================================================================

// Warning thresholds for unsafe settings
const UNSAFE_THRESHOLDS = {
  maxPositionSize: 25,     // > 25% per position is very risky
  maxDailyLoss: 10,        // > 10% daily loss is aggressive
  maxDrawdown: 30,         // > 30% max drawdown is risky
  maxCapitalUsage: 90,     // > 90% capital usage leaves no reserve
};

export function RiskSettingsPanel() {
  const { riskStatus, updateRiskSettings, isLoading } = useRiskManager();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});

  if (isLoading || !riskStatus) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const { settings } = riskStatus;

  const getValue = (key: string): number => {
    if (pendingChanges[key] !== undefined) return pendingChanges[key];
    return (settings as any)[key] || 0;
  };

  const handleChange = (key: string, value: number) => {
    setPendingChanges(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) return;

    setIsSaving(true);
    const success = await updateRiskSettings(pendingChanges);
    setIsSaving(false);

    if (success) {
      toast({
        title: 'Settings Saved',
        description: 'Your risk settings have been updated.',
      });
      setPendingChanges({});
    } else {
      toast({
        title: 'Error',
        description: 'Failed to save risk settings.',
        variant: 'destructive',
      });
    }
  };

  const hasUnsafeSettings = 
    getValue('maxPositionSize') > UNSAFE_THRESHOLDS.maxPositionSize ||
    getValue('maxDailyLoss') > UNSAFE_THRESHOLDS.maxDailyLoss ||
    getValue('maxDrawdown') > UNSAFE_THRESHOLDS.maxDrawdown ||
    getValue('maxCapitalUsage') > UNSAFE_THRESHOLDS.maxCapitalUsage;

  const hasChanges = Object.keys(pendingChanges).length > 0;

  const SettingRow = ({ 
    label, 
    description, 
    settingKey, 
    min, 
    max, 
    step = 1,
    unit = '%',
    warningThreshold,
  }: {
    label: string;
    description: string;
    settingKey: string;
    min: number;
    max: number;
    step?: number;
    unit?: string;
    warningThreshold?: number;
  }) => {
    const value = getValue(settingKey);
    const isUnsafe = warningThreshold !== undefined && value > warningThreshold;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-xs">{description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {isUnsafe && (
              <span className="flex items-center gap-1 text-xs text-warning">
                <AlertTriangle className="w-3 h-3" />
                High risk
              </span>
            )}
          </div>
          <span className={cn(
            'font-mono font-medium text-sm',
            isUnsafe ? 'text-warning' : 'text-foreground',
            pendingChanges[settingKey] !== undefined && 'text-primary'
          )}>
            {value}{unit}
          </span>
        </div>
        <Slider
          value={[value]}
          onValueChange={([v]) => handleChange(settingKey, v)}
          min={min}
          max={max}
          step={step}
          className={cn(
            'w-full',
            isUnsafe && '[&>span>span]:bg-warning'
          )}
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
            <h3 className="text-lg font-semibold text-foreground">Risk Settings</h3>
            <p className="text-sm text-muted-foreground">Configure your risk management limits</p>
          </div>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        )}
      </div>

      {/* Unsafe Settings Warning */}
      {hasUnsafeSettings && (
        <div className="mb-6 p-4 rounded-lg bg-warning/10 border border-warning/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning mt-0.5" />
            <div>
              <p className="font-medium text-warning">Aggressive Settings Detected</p>
              <p className="text-sm text-warning/80 mt-1">
                Some of your risk settings are higher than recommended. This increases your risk of significant losses.
                Consider using more conservative values.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Position Size */}
        <SettingRow
          label="Max Position Size"
          description="Maximum percentage of your equity that can be allocated to a single position. Lower values reduce concentration risk."
          settingKey="maxPositionSize"
          min={1}
          max={50}
          warningThreshold={UNSAFE_THRESHOLDS.maxPositionSize}
        />

        {/* Daily Loss */}
        <SettingRow
          label="Max Daily Loss"
          description="Trading stops automatically if daily losses reach this percentage. Protects against bad trading days."
          settingKey="maxDailyLoss"
          min={1}
          max={20}
          warningThreshold={UNSAFE_THRESHOLDS.maxDailyLoss}
        />

        {/* Weekly Loss */}
        <SettingRow
          label="Max Weekly Loss"
          description="Trading stops for the week if weekly losses reach this percentage. Prevents prolonged losing streaks."
          settingKey="weeklyLossLimit"
          min={3}
          max={30}
          warningThreshold={15}
        />

        {/* Max Drawdown */}
        <SettingRow
          label="Max Drawdown (Kill Switch)"
          description="If drawdown from peak equity exceeds this percentage, the kill switch triggers and all trading stops until manually reset."
          settingKey="maxDrawdown"
          min={5}
          max={50}
          warningThreshold={UNSAFE_THRESHOLDS.maxDrawdown}
        />

        {/* Capital Usage */}
        <SettingRow
          label="Max Capital Usage"
          description="Maximum percentage of total capital that can be deployed across all positions. Keeps reserve for opportunities and margin."
          settingKey="maxCapitalUsage"
          min={10}
          max={100}
          step={5}
          warningThreshold={UNSAFE_THRESHOLDS.maxCapitalUsage}
        />

        {/* Concurrent Trades */}
        <SettingRow
          label="Max Concurrent Trades"
          description="Maximum number of positions that can be open simultaneously. Lower values concentrate focus, higher values diversify."
          settingKey="maxConcurrentTrades"
          min={1}
          max={20}
          unit=""
        />

        {/* Leverage */}
        <SettingRow
          label="Max Leverage"
          description="Maximum leverage allowed. Default is 1x (no leverage). Higher leverage amplifies both gains AND losses."
          settingKey="maxLeverage"
          min={1}
          max={10}
          unit="x"
          warningThreshold={3}
        />
      </div>

      {/* Conservative Defaults Info */}
      <div className="mt-6 p-4 rounded-lg bg-muted/50">
        <p className="text-xs text-muted-foreground">
          <strong>Recommended conservative defaults:</strong> 5% max position, 3% daily loss, 10% weekly loss, 
          20% max drawdown, 50% capital usage, 5 concurrent trades, 1x leverage. These settings prioritize 
          capital preservation over aggressive growth.
        </p>
      </div>
    </div>
  );
}

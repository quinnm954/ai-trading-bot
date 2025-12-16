import { useState, useEffect } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// =============================================================================
// Risk Settings Panel - Configure risk management parameters
// =============================================================================

// Preset configurations for each risk tolerance level
const RISK_PRESETS = {
  conservative: {
    maxPositionSize: 5,
    maxDailyLoss: 3,
    weeklyLossLimit: 10,
    maxDrawdown: 20,
    maxConcurrentTrades: 5,
    maxCapitalUsage: 50,
    maxLeverage: 1,
  },
  moderate: {
    maxPositionSize: 10,
    maxDailyLoss: 5,
    weeklyLossLimit: 12,
    maxDrawdown: 25,
    maxConcurrentTrades: 8,
    maxCapitalUsage: 70,
    maxLeverage: 1,
  },
  aggressive: {
    maxPositionSize: 20,
    maxDailyLoss: 8,
    weeklyLossLimit: 18,
    maxDrawdown: 30,
    maxConcurrentTrades: 12,
    maxCapitalUsage: 85,
    maxLeverage: 2,
  },
  ultra_aggressive: {
    maxPositionSize: 30,
    maxDailyLoss: 10,
    weeklyLossLimit: 25,
    maxDrawdown: 40,
    maxConcurrentTrades: 20,
    maxCapitalUsage: 95,
    maxLeverage: 3,
  },
};

// Warning thresholds for unsafe settings
const UNSAFE_THRESHOLDS = {
  maxPositionSize: 25,     // > 25% per position is very risky
  maxDailyLoss: 10,        // > 10% daily loss is aggressive
  maxDrawdown: 30,         // > 30% max drawdown is risky
  maxCapitalUsage: 90,     // > 90% capital usage leaves no reserve
  maxLeverage: 2,          // > 2x leverage is risky
};

type RiskTolerance = 'conservative' | 'moderate' | 'aggressive' | 'ultra_aggressive';

export function RiskSettingsPanel() {
  const { riskStatus, updateRiskSettings, isLoading } = useRiskManager();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, any>>({});
  const [hasManualChanges, setHasManualChanges] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<RiskTolerance | null>(null);

  // Initialize selected preset from current settings
  useEffect(() => {
    if (riskStatus?.settings?.riskTolerance) {
      setSelectedPreset(riskStatus.settings.riskTolerance);
    }
  }, [riskStatus?.settings?.riskTolerance]);

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

  const getValue = (key: string): any => {
    if (pendingChanges[key] !== undefined) return pendingChanges[key];
    return (settings as any)[key] ?? (key === 'riskTolerance' ? 'moderate' : 0);
  };

  const handlePresetSelect = (preset: RiskTolerance) => {
    setSelectedPreset(preset);
    setHasManualChanges(false);
    const presetValues = RISK_PRESETS[preset];
    setPendingChanges({
      ...presetValues,
      riskTolerance: preset,
    });
  };

  const handleManualChange = (key: string, value: any) => {
    // Check if this change deviates from the current preset
    if (selectedPreset && key !== 'riskTolerance') {
      const presetValue = (RISK_PRESETS[selectedPreset] as any)[key];
      if (presetValue !== undefined && presetValue !== value) {
        setHasManualChanges(true);
      }
    }
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
      setHasManualChanges(false);
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
    getValue('maxCapitalUsage') > UNSAFE_THRESHOLDS.maxCapitalUsage ||
    getValue('maxLeverage') > UNSAFE_THRESHOLDS.maxLeverage;

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
          onValueChange={([v]) => handleManualChange(settingKey, v)}
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

      {/* Manual Changes Warning */}
      {hasManualChanges && (
        <Alert className="mb-6 border-warning/50 bg-warning/10">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            <strong>Custom configuration:</strong> You've manually adjusted settings that deviate from the selected preset. These values may not align with standard risk tolerance profiles. Proceed with caution.
          </AlertDescription>
        </Alert>
      )}

      {/* Unsafe Settings Warning */}
      {hasUnsafeSettings && !hasManualChanges && (
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
        {/* Trading Goal Info */}
        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium text-foreground">Goal: Maximize Profit, Minimize Loss</p>
              <p className="text-sm text-muted-foreground mt-1">
                The AI will automatically optimize trading to maximize returns while respecting your risk limits below.
                Connect your brokerage, configure these settings, and let it run.
              </p>
            </div>
          </div>
        </div>

        {/* Risk Tolerance Presets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">Risk Tolerance Profile</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">Select a preset to automatically configure all settings below. Manual adjustments will show a warning.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {(['conservative', 'moderate', 'aggressive', 'ultra_aggressive'] as RiskTolerance[]).map((level) => (
              <button
                key={level}
                onClick={() => handlePresetSelect(level)}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium transition-all capitalize',
                  selectedPreset === level && !hasManualChanges
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
            {selectedPreset === 'conservative' && 'Smaller positions, tighter stops, fewer trades. Best for capital preservation.'}
            {selectedPreset === 'moderate' && 'Balanced approach between growth and safety.'}
            {selectedPreset === 'aggressive' && 'Larger positions, wider stops, more trades. Higher growth potential with more risk.'}
            {selectedPreset === 'ultra_aggressive' && 'Maximum position sizes and leverage. Highest potential returns but significant risk.'}
            {!selectedPreset && 'Select a profile to auto-configure all settings below.'}
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

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
          warningThreshold={UNSAFE_THRESHOLDS.maxLeverage}
        />
      </div>

      {/* Conservative Defaults Info */}
      <div className="mt-6 p-4 rounded-lg bg-muted/50">
        <p className="text-xs text-muted-foreground">
          <strong>Recommended:</strong> Start with Conservative or Moderate profiles until you're comfortable with the system. 
          Higher risk profiles can lead to larger gains but also significant losses.
        </p>
      </div>
    </div>
  );
}

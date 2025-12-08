import { Shield, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SafetyGovernor } from '@/types/trading';

interface SafetyStatusCardProps {
  safety: SafetyGovernor;
}

export function SafetyStatusCard({ safety }: SafetyStatusCardProps) {
  const getStatusConfig = () => {
    if (!safety.tradingAllowed) {
      return {
        status: 'red' as const,
        label: 'Trading Paused',
        icon: XCircle,
        color: 'text-loss',
        bgColor: 'bg-loss/20',
        borderColor: 'border-loss/30',
      };
    }
    if (safety.dailyLossUsed / safety.dailyLossLimit > 0.7 || safety.volatilityLevel === 'elevated') {
      return {
        status: 'yellow' as const,
        label: 'Caution',
        icon: AlertTriangle,
        color: 'text-warning',
        bgColor: 'bg-warning/20',
        borderColor: 'border-warning/30',
      };
    }
    return {
      status: 'green' as const,
      label: 'All Clear',
      icon: CheckCircle,
      color: 'text-profit',
      bgColor: 'bg-profit/20',
      borderColor: 'border-profit/30',
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const dailyLossPercent = (safety.dailyLossUsed / safety.dailyLossLimit) * 100;
  const drawdownPercent = (safety.currentDrawdown / safety.maxDrawdownLimit) * 100;

  return (
    <div className={cn('glass-panel p-4 border', config.borderColor)}>
      <div className="flex items-center gap-3 mb-4">
        <div className={cn('p-2 rounded-lg', config.bgColor)}>
          <Shield className={cn('w-5 h-5', config.color)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Safety Governor</p>
          <div className="flex items-center gap-2">
            <Icon className={cn('w-4 h-4', config.color)} />
            <p className={cn('font-bold', config.color)}>{config.label}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Daily Loss</span>
            <span className={dailyLossPercent > 70 ? 'text-warning' : 'text-foreground'}>
              ${safety.dailyLossUsed.toFixed(0)} / ${safety.dailyLossLimit}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div 
              className={cn(
                'h-full transition-all',
                dailyLossPercent > 80 ? 'bg-loss' : dailyLossPercent > 50 ? 'bg-warning' : 'bg-profit'
              )}
              style={{ width: `${Math.min(dailyLossPercent, 100)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Drawdown</span>
            <span className={drawdownPercent > 70 ? 'text-warning' : 'text-foreground'}>
              {safety.currentDrawdown.toFixed(1)}% / {safety.maxDrawdownLimit}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div 
              className={cn(
                'h-full transition-all',
                drawdownPercent > 80 ? 'bg-loss' : drawdownPercent > 50 ? 'bg-warning' : 'bg-profit'
              )}
              style={{ width: `${Math.min(drawdownPercent, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">API Status</span>
          <span className={cn(
            'text-xs font-medium',
            safety.isApiConnected ? 'text-profit' : 'text-loss'
          )}>
            {safety.isApiConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Volatility</span>
          <span className={cn(
            'text-xs font-medium capitalize',
            safety.volatilityLevel === 'extreme' ? 'text-loss' : 
            safety.volatilityLevel === 'elevated' ? 'text-warning' : 'text-profit'
          )}>
            {safety.volatilityLevel}
          </span>
        </div>
      </div>

      {safety.pauseReasons.length > 0 && (
        <div className="mt-4 p-2 rounded bg-loss/10 border border-loss/20">
          <p className="text-xs text-loss font-medium mb-1">Pause Reasons:</p>
          <ul className="text-xs text-loss/80 list-disc list-inside">
            {safety.pauseReasons.map((reason, i) => (
              <li key={i}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

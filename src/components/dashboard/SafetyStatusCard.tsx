import { Shield, AlertTriangle, XCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAISettings } from '@/hooks/useAISettings';
import { useApiConnections } from '@/hooks/useApiConnections';

export function SafetyStatusCard() {
  const { settings, isLoading: settingsLoading } = useAISettings();
  const { connections, loading: connectionsLoading } = useApiConnections();

  const isLoading = settingsLoading || connectionsLoading;
  const hasConnectedBroker = connections.some(c => c.is_connected);

  // Calculate safety metrics based on AI settings
  const maxDailyLoss = settings?.maxDailyLoss || 5;
  const dailyLossLimit = 5000; // 5% of $100k
  const dailyLossUsed = 0; // Would need to calculate from trades
  
  const getStatusConfig = () => {
    if (!settings?.enabled) {
      return {
        status: 'green' as const,
        label: 'All Clear',
        icon: CheckCircle,
        color: 'text-profit',
        bgColor: 'bg-profit/20',
        borderColor: 'border-profit/30',
      };
    }
    if (!hasConnectedBroker && settings.tradingMode === 'live') {
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
  const dailyLossPercent = (dailyLossUsed / dailyLossLimit) * 100;

  if (isLoading) {
    return (
      <div className="glass-panel p-4 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-muted">
            <Shield className="w-5 h-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Safety Governor</p>
            <p className="font-bold text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

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
            <span className="text-muted-foreground">Daily Loss Limit</span>
            <span className="text-foreground">
              {maxDailyLoss}% max
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
            <span className="text-muted-foreground">Max Position Size</span>
            <span className="text-foreground">
              {settings?.maxPositionSize || 10}% of capital
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <span className="text-xs text-muted-foreground">Broker Connection</span>
          <span className={cn(
            'text-xs font-medium',
            hasConnectedBroker ? 'text-profit' : 'text-muted-foreground'
          )}>
            {hasConnectedBroker ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Trading Mode</span>
          <span className="text-xs font-medium capitalize text-foreground">
            {settings?.tradingMode || 'paper'}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Max Concurrent Trades</span>
          <span className="text-xs font-medium text-foreground">
            {settings?.maxConcurrentTrades || 5}
          </span>
        </div>
      </div>
    </div>
  );
}

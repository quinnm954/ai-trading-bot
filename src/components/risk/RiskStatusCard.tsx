import { 
  Shield, 
  AlertTriangle, 
  AlertOctagon, 
  TrendingDown,
  Calendar,
  CalendarDays,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useRiskManager, RiskEvent } from '@/hooks/useRiskManager';

// =============================================================================
// Risk Status Card - Shows current risk metrics and warnings
// =============================================================================

export function RiskStatusCard() {
  const {
    riskStatus,
    isLoading,
    isKillSwitchActive,
    currentDrawdown,
    dailyLossPercent,
    weeklyLossPercent,
    resetKillSwitch,
    fetchRiskStatus,
  } = useRiskManager();

  if (isLoading || !riskStatus) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const { settings, recentEvents, riskMetrics } = riskStatus;

  // Determine overall risk level
  const getRiskLevel = () => {
    if (isKillSwitchActive) return 'critical';
    if (dailyLossPercent >= settings.maxDailyLoss * 0.8 || 
        weeklyLossPercent >= settings.weeklyLossLimit * 0.8 ||
        currentDrawdown >= settings.maxDrawdown * 0.8) {
      return 'high';
    }
    if (dailyLossPercent >= settings.maxDailyLoss * 0.5 ||
        weeklyLossPercent >= settings.weeklyLossLimit * 0.5 ||
        currentDrawdown >= settings.maxDrawdown * 0.5) {
      return 'medium';
    }
    return 'low';
  };

  const riskLevel = getRiskLevel();

  const riskColors = {
    critical: 'bg-loss/20 border-loss/50 text-loss',
    high: 'bg-orange-500/20 border-orange-500/50 text-orange-400',
    medium: 'bg-warning/20 border-warning/50 text-warning',
    low: 'bg-success/20 border-success/50 text-success',
  };

  const riskIcons = {
    critical: AlertOctagon,
    high: AlertTriangle,
    medium: AlertTriangle,
    low: Shield,
  };

  const RiskIcon = riskIcons[riskLevel];

  return (
    <div className={cn(
      'glass-panel p-6 transition-all duration-300',
      isKillSwitchActive && 'border-loss/50 animate-pulse'
    )}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn('p-3 rounded-xl', riskColors[riskLevel])}>
            <RiskIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Risk Status</h3>
            <p className={cn('text-sm font-medium capitalize', riskColors[riskLevel].split(' ').pop())}>
              {isKillSwitchActive ? 'TRADING HALTED' : `${riskLevel} risk`}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchRiskStatus}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Kill Switch Banner */}
      {isKillSwitchActive && (
        <div className="mb-6 p-4 rounded-lg bg-loss/20 border border-loss/50">
          <div className="flex items-start gap-3">
            <AlertOctagon className="w-5 h-5 text-loss mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-loss">Kill Switch Active</p>
              <p className="text-sm text-loss/80 mt-1">
                Trading has been automatically halted due to exceeding maximum drawdown limit.
                Review your strategy before resetting.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-loss text-loss hover:bg-loss/20"
                onClick={resetKillSwitch}
              >
                Reset Kill Switch
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Risk Metrics */}
      <div className="space-y-4">
        {/* Daily Loss */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Daily Loss</span>
            </div>
            <span className={cn(
              'text-sm font-medium',
              dailyLossPercent >= settings.maxDailyLoss ? 'text-loss' : 
              dailyLossPercent >= settings.maxDailyLoss * 0.8 ? 'text-orange-400' : 'text-foreground'
            )}>
              {dailyLossPercent.toFixed(2)}% / {settings.maxDailyLoss}%
            </span>
          </div>
          <Progress 
            value={Math.min((dailyLossPercent / settings.maxDailyLoss) * 100, 100)} 
            className={cn(
              'h-2',
              dailyLossPercent >= settings.maxDailyLoss && '[&>div]:bg-loss',
              dailyLossPercent >= settings.maxDailyLoss * 0.8 && dailyLossPercent < settings.maxDailyLoss && '[&>div]:bg-orange-500'
            )}
          />
        </div>

        {/* Weekly Loss */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Weekly Loss</span>
            </div>
            <span className={cn(
              'text-sm font-medium',
              weeklyLossPercent >= settings.weeklyLossLimit ? 'text-loss' :
              weeklyLossPercent >= settings.weeklyLossLimit * 0.8 ? 'text-orange-400' : 'text-foreground'
            )}>
              {weeklyLossPercent.toFixed(2)}% / {settings.weeklyLossLimit}%
            </span>
          </div>
          <Progress 
            value={Math.min((weeklyLossPercent / settings.weeklyLossLimit) * 100, 100)}
            className={cn(
              'h-2',
              weeklyLossPercent >= settings.weeklyLossLimit && '[&>div]:bg-loss',
              weeklyLossPercent >= settings.weeklyLossLimit * 0.8 && weeklyLossPercent < settings.weeklyLossLimit && '[&>div]:bg-orange-500'
            )}
          />
        </div>

        {/* Max Drawdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Drawdown from Peak</span>
            </div>
            <span className={cn(
              'text-sm font-medium',
              currentDrawdown >= settings.maxDrawdown ? 'text-loss' :
              currentDrawdown >= settings.maxDrawdown * 0.8 ? 'text-orange-400' : 'text-foreground'
            )}>
              {currentDrawdown.toFixed(2)}% / {settings.maxDrawdown}%
            </span>
          </div>
          <Progress 
            value={Math.min((currentDrawdown / settings.maxDrawdown) * 100, 100)}
            className={cn(
              'h-2',
              currentDrawdown >= settings.maxDrawdown && '[&>div]:bg-loss',
              currentDrawdown >= settings.maxDrawdown * 0.8 && currentDrawdown < settings.maxDrawdown && '[&>div]:bg-orange-500'
            )}
          />
        </div>
      </div>

      {/* Recent Risk Events */}
      {recentEvents.length > 0 && (
        <div className="mt-6 pt-6 border-t border-border">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Recent Risk Events</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {recentEvents.slice(0, 5).map((event: RiskEvent) => (
              <div 
                key={event.id}
                className={cn(
                  'flex items-start gap-2 p-2 rounded-lg text-xs',
                  event.severity === 'critical' && 'bg-loss/10 text-loss',
                  event.severity === 'warning' && 'bg-warning/10 text-warning',
                  event.severity === 'info' && 'bg-muted/50 text-muted-foreground'
                )}
              >
                {event.severity === 'critical' && <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                {event.severity === 'warning' && <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                {event.severity === 'info' && <CheckCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="truncate">{event.message}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

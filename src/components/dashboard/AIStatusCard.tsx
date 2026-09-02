import { Bot, Zap, Activity, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAISettings } from '@/hooks/useAISettings';
import { useLastExitCheck } from '@/hooks/useLastExitCheck';
import { cn } from '@/lib/utils';

export function AIStatusCard() {
  const { settings, isLoading } = useAISettings();
  const { lastCheck, hasOpenPositions, isStale } = useLastExitCheck();

  if (isLoading || !settings) {
    return (
      <div className="glass-panel p-4 sm:p-6 gradient-border">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-muted">
            <Bot className="w-6 h-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">AI Trader</h3>
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  const statusLabels: Record<string, string> = {
    idle: 'Idle',
    learning: 'Learning',
    trading: 'Trading Autonomously',
  };

  return (
    <div className="glass-panel p-4 sm:p-6 gradient-border">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-3 rounded-xl',
            settings.enabled ? 'bg-success/20' : 'bg-muted'
          )}>
            <Bot className={cn(
              'w-6 h-6',
              settings.enabled ? 'text-success' : 'text-muted-foreground'
            )} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">Fully Autonomous AI</h3>
              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary/20 text-primary animate-pulse">
                AUTO
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {settings.enabled ? (
                <>
                  <span className="flex items-center gap-1 text-success text-sm">
                    <Zap className="w-3 h-3" />
                    Running Autonomously
                  </span>
                  <span className="text-muted-foreground text-sm">•</span>
                  <span className="text-muted-foreground text-sm capitalize">
                    {statusLabels[settings.botStatus] || settings.botStatus}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-sm">Disabled</span>
              )}
            </div>
          </div>
        </div>
        <Button 
          variant={settings.enabled ? 'glow-success' : 'outline'}
          size="sm"
        >
          {settings.enabled ? 'Running' : 'Start'}
        </Button>
      </div>

      {settings.enabled && (
        <>
          <div className="p-4 rounded-lg bg-secondary/50 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Current Market Regime</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed capitalize">
              {settings.currentRegime.replace('_', ' ')} market conditions detected
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Trading Mode</p>
              <p className="text-sm font-medium text-foreground capitalize">{settings.tradingMode}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Last Exit Check</p>
              <p className={cn(
                'text-sm font-medium',
                !hasOpenPositions ? 'text-muted-foreground' : isStale ? 'text-destructive' : 'text-success'
              )}>
                {!hasOpenPositions
                  ? 'No open positions'
                  : lastCheck
                    ? lastCheck.toLocaleTimeString()
                    : '—'}
              </p>
            </div>
          </div>
        </>
      )}

      {!settings.enabled && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/30">
          <Activity className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Enable AI Auto-Trader to automatically analyze markets and execute trades.
          </p>
        </div>
      )}
    </div>
  );
}

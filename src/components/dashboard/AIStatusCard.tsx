import { Bot, Zap, Activity, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mockAITraderState } from '@/lib/mockData';
import { cn } from '@/lib/utils';

export function AIStatusCard() {
  const state = mockAITraderState;

  return (
    <div className="glass-panel p-6 gradient-border">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            'p-3 rounded-xl',
            state.isEnabled ? 'bg-success/20' : 'bg-muted'
          )}>
            <Bot className={cn(
              'w-6 h-6',
              state.isEnabled ? 'text-success' : 'text-muted-foreground'
            )} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">AI Auto-Trader</h3>
            <div className="flex items-center gap-2 mt-1">
              {state.isEnabled ? (
                <>
                  <span className="flex items-center gap-1 text-success text-sm">
                    <Zap className="w-3 h-3" />
                    Active
                  </span>
                  <span className="text-muted-foreground text-sm">•</span>
                  <span className="text-muted-foreground text-sm capitalize">{state.status}</span>
                </>
              ) : (
                <span className="text-muted-foreground text-sm">Disabled</span>
              )}
            </div>
          </div>
        </div>
        <Button 
          variant={state.isEnabled ? 'glow-success' : 'outline'}
          size="sm"
        >
          {state.isEnabled ? 'Running' : 'Start'}
        </Button>
      </div>

      {state.isEnabled && (
        <>
          <div className="p-4 rounded-lg bg-secondary/50 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Brain className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Current Analysis</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {state.reason}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Active Strategy</p>
              <p className="text-sm font-medium text-foreground">{state.currentStrategy}</p>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <p className="text-xs text-muted-foreground mb-1">Last Analysis</p>
              <p className="text-sm font-medium text-foreground">
                {state.lastAnalysis?.toLocaleTimeString()}
              </p>
            </div>
          </div>
        </>
      )}

      {!state.isEnabled && (
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

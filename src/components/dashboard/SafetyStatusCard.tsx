import { Shield, AlertTriangle, XCircle, CheckCircle, Pause, Activity, FlaskConical, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { useAISettings } from '@/hooks/useAISettings';
import { useApiConnections } from '@/hooks/useApiConnections';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

type StatusKey =
  | 'safe'
  | 'caution'
  | 'high_volatility'
  | 'daily_limit_hit'
  | 'paused'
  | 'paper_only'
  | 'live_disabled';

const STATUS: Record<StatusKey, { label: string; icon: any; tone: string; bg: string; border: string }> = {
  safe:             { label: 'Safe to Trade',     icon: CheckCircle, tone: 'text-profit',  bg: 'bg-profit/15',  border: 'border-profit/30' },
  caution:          { label: 'Caution',           icon: AlertTriangle, tone: 'text-warning', bg: 'bg-warning/15', border: 'border-warning/30' },
  high_volatility:  { label: 'High Volatility',   icon: Activity,    tone: 'text-warning', bg: 'bg-warning/15', border: 'border-warning/30' },
  daily_limit_hit:  { label: 'Daily Limit Hit',   icon: XCircle,     tone: 'text-loss',    bg: 'bg-loss/15',    border: 'border-loss/30' },
  paused:           { label: 'Paused',            icon: Pause,       tone: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border' },
  paper_only:       { label: 'Paper Trading Only', icon: FlaskConical, tone: 'text-primary', bg: 'bg-primary/15', border: 'border-primary/30' },
  live_disabled:    { label: 'Live Trading Disabled', icon: Lock,   tone: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border' },
};

export function SafetyStatusCard() {
  const { user } = useAuth();
  const { settings, isLoading: settingsLoading } = useAISettings();
  const { connections, loading: connLoading } = useApiConnections();
  const [dailyLossUsed, setDailyLossUsed] = useState(0);
  // Consecutive-losses governor removed per user request.

  const hasBroker = connections.some((c) => c.is_connected);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data: todayTrades } = await supabase
        .from('trades')
        .select('pnl, closed_at')
        .eq('user_id', user.id)
        .eq('status', 'closed')
        .gte('closed_at', todayStart.toISOString())
        .order('closed_at', { ascending: false })
        .limit(50);
      if (todayTrades) {
        const loss = todayTrades.reduce((s, t) => s + Math.min(0, Number(t.pnl) || 0), 0);
        setDailyLossUsed(Math.abs(loss));
      }
    })();
  }, [user]);

  const maxDailyLossPct = settings?.maxDailyLoss || 3;
  const equityForCap = 100000;
  const dailyLossCap = equityForCap * (maxDailyLossPct / 100);
  const dailyLossPct = dailyLossCap > 0 ? (dailyLossUsed / dailyLossCap) * 100 : 0;

  let statusKey: StatusKey = 'safe';
  if (!settings?.enabled) statusKey = 'paused';
  else if (dailyLossPct >= 100) statusKey = 'daily_limit_hit';
  else if (dailyLossPct >= 60) statusKey = 'caution';
  else if (dailyLossPct >= 60) statusKey = 'caution';
  else if (settings.tradingMode === 'live' && !hasBroker) statusKey = 'live_disabled';
  else if (settings.tradingMode === 'paper') statusKey = 'paper_only';

  if (settingsLoading || connLoading) {
    return (
      <div className="glass-panel p-4 border border-border">
        <p className="text-muted-foreground text-sm">Loading safety status…</p>
      </div>
    );
  }

  const cfg = STATUS[statusKey];
  const Icon = cfg.icon;

  return (
    <div className={cn('glass-panel p-4 border', cfg.border)}>
      <div className="flex items-center gap-3 mb-4">
        <div className={cn('p-2 rounded-lg', cfg.bg)}>
          <Shield className={cn('w-5 h-5', cfg.tone)} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Safety Governor</p>
          <div className="flex items-center gap-2">
            <Icon className={cn('w-4 h-4', cfg.tone)} />
            <p className={cn('font-bold', cfg.tone)}>{cfg.label}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Daily Loss</span>
            <span className="text-foreground">
              ${dailyLossUsed.toFixed(0)} / ${dailyLossCap.toFixed(0)} ({maxDailyLossPct}%)
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden">
            <div
              className={cn('h-full transition-all', dailyLossPct > 80 ? 'bg-loss' : dailyLossPct > 50 ? 'bg-warning' : 'bg-profit')}
              style={{ width: `${Math.min(dailyLossPct, 100)}%` }}
            />
          </div>
        </div>

        <Row label="Consecutive Losses" value={`${consecutiveLosses} / 3`} tone={consecutiveLosses >= 3 ? 'loss' : undefined} />
        <Row label="Max Position Size" value={`${settings?.maxPositionSize || 10}%`} />
        <Row label="Broker" value={hasBroker ? 'Connected' : 'Not Connected'} tone={hasBroker ? undefined : 'muted'} />
        <Row label="Mode" value={(settings?.tradingMode || 'paper').toUpperCase()} />
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'loss' | 'muted' }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium', tone === 'loss' ? 'text-loss' : tone === 'muted' ? 'text-muted-foreground' : 'text-foreground')}>
        {value}
      </span>
    </div>
  );
}

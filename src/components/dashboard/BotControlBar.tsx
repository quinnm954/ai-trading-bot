import { useCallback, useEffect, useState } from 'react';
import { Loader2, Play, Square, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { MarketModeSwitcher } from '@/components/dashboard/MarketModeSwitcher';

/**
 * Top-of-dashboard control bar: pick the market (crypto/stocks) and start or
 * stop the trading bot. A manual stop sticks — nothing re-enables it silently.
 */
export function BotControlBar() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [botStatus, setBotStatus] = useState<string>('idle');
  const [killSwitch, setKillSwitch] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('ai_settings')
      .select('enabled, bot_status, kill_switch_active')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data) {
      setEnabled(Boolean(data.enabled));
      setBotStatus(data.bot_status ?? 'idle');
      setKillSwitch(Boolean(data.kill_switch_active));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBot = async () => {
    const next = !enabled;
    if (next && killSwitch) {
      toast({
        title: 'Safety stop is active',
        description: 'Clear the kill switch on the Risk Management page before starting the bot.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from('ai_settings')
      .update({ enabled: next, bot_status: next ? 'trading' : 'idle' })
      .eq('user_id', user.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Could not change the bot', description: error.message, variant: 'destructive' });
      return;
    }
    setEnabled(next);
    setBotStatus(next ? 'trading' : 'idle');
    toast({
      title: next ? 'Trading bot started' : 'Trading bot stopped',
      description: next
        ? 'Agents run every 30 minutes on the server, even with the app closed.'
        : 'No new entries will be opened until you start it again.',
    });
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl border border-border bg-card">
      <MarketModeSwitcher />

      <div className="flex items-center gap-3">
        {killSwitch && (
          <Badge variant="destructive" className="gap-1">
            <ShieldAlert className="w-3 h-3" />
            Safety stop
          </Badge>
        )}
        <Badge variant={enabled ? 'default' : 'secondary'}>
          {loading ? '…' : enabled ? `Running · ${botStatus}` : 'Stopped'}
        </Badge>
        <Button
          variant={enabled ? 'destructive' : 'default'}
          size="sm"
          className="gap-2"
          disabled={loading || saving}
          onClick={toggleBot}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : enabled ? (
            <Square className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {enabled ? 'Stop bot' : 'Start bot'}
        </Button>
      </div>
    </div>
  );
}

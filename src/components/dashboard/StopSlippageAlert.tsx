import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

interface SlippageEvent {
  id: string;
  message: string;
  severity: string;
  created_at: string;
}

const DISMISS_KEY = 'stopSlippageDismissedAt';

export function StopSlippageAlert() {
  const [events, setEvents] = useState<SlippageEvent[]>([]);
  const [dismissedAt, setDismissedAt] = useState<string | null>(
    () => localStorage.getItem(DISMISS_KEY)
  );

  const fetchEvents = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('risk_events')
      .select('id, message, severity, created_at')
      .eq('user_id', user.id)
      .eq('event_type', 'stop_slippage')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5);
    setEvents((data as SlippageEvent[]) || []);
  }, []);

  useEffect(() => {
    fetchEvents();
    const channel = supabase
      .channel(`stop-slippage-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'risk_events' },
        () => fetchEvents()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchEvents]);

  const visible = events.filter(
    (e) => !dismissedAt || new Date(e.created_at) > new Date(dismissedAt)
  );
  if (visible.length === 0) return null;

  const dismiss = () => {
    const now = new Date().toISOString();
    localStorage.setItem(DISMISS_KEY, now);
    setDismissedAt(now);
  };

  return (
    <div className="glass-panel p-4 border border-destructive/40 bg-destructive/10">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            Stop-loss slippage detected ({visible.length} in last 24h)
          </p>
          <ul className="mt-1 space-y-1">
            {visible.map((e) => (
              <li key={e.id} className="text-sm text-muted-foreground break-words">
                {e.message}
              </li>
            ))}
          </ul>
          <Button asChild variant="link" size="sm" className="px-0 h-auto mt-1">
            <Link to="/risk-management">Review risk events</Link>
          </Button>
        </div>
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss slippage alert">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

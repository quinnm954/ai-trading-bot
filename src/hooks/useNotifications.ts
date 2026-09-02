import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  LAST_READ_KEY,
  PREFS_EVENT,
  loadNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/notificationPrefs';

export type NotificationKind = 'trade' | 'profit' | 'loss' | 'risk' | 'ai';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  description: string;
  createdAt: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  link: string;
}

const LOOKBACK_HOURS = 72;

function fmt(n: number) {
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs());
  const [lastRead, setLastRead] = useState<string>(
    () => localStorage.getItem(LAST_READ_KEY) || new Date(0).toISOString()
  );

  useEffect(() => {
    const sync = () => setPrefs(loadNotificationPrefs());
    window.addEventListener(PREFS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PREFS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const fetchAll = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

    const [tradesRes, riskRes, agentRes] = await Promise.all([
      supabase
        .from('trades')
        .select('id, symbol, side, pnl, status, strategy, exit_reason, closed_at, created_at, is_paper')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('risk_events')
        .select('id, event_type, message, severity, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('agent_messages')
        .select('id, from_agent, subject, message_type, priority, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .in('priority', ['high', 'critical'])
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    const items: AppNotification[] = [];

    for (const t of tradesRes.data ?? []) {
      const closed = t.status === 'closed' || t.status === 'stopped_out';
      const pnl = Number(t.pnl ?? 0);
      const when = (closed ? t.closed_at : t.created_at) || t.created_at || since;
      if (closed) {
        const win = pnl >= 0;
        if (win ? !prefs.profits : !prefs.losses) continue;
        items.push({
          id: `trade-close-${t.id}`,
          kind: win ? 'profit' : 'loss',
          title: `${t.symbol} closed ${fmt(pnl)}`,
          description: `${t.strategy ?? 'strategy'} · ${t.exit_reason ?? 'exit'}${t.is_paper ? ' · paper' : ' · live'}`,
          createdAt: when,
          severity: win ? 'success' : 'warning',
          link: '/trades',
        });
      } else {
        if (!prefs.trades) continue;
        items.push({
          id: `trade-open-${t.id}`,
          kind: 'trade',
          title: `${t.symbol} ${String(t.side).toUpperCase()} opened`,
          description: `${t.strategy ?? 'strategy'}${t.is_paper ? ' · paper' : ' · live'}`,
          createdAt: when,
          severity: 'info',
          link: '/trades',
        });
      }
    }

    for (const e of riskRes.data ?? []) {
      items.push({
        id: `risk-${e.id}`,
        kind: 'risk',
        title: e.event_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        description: e.message,
        createdAt: e.created_at || since,
        severity: e.severity === 'critical' ? 'critical' : e.severity === 'warning' ? 'warning' : 'info',
        link: '/risk-management',
      });
    }

    if (prefs.aiDecisions) {
      for (const m of agentRes.data ?? []) {
        items.push({
          id: `agent-${m.id}`,
          kind: 'ai',
          title: `${m.from_agent} · ${m.message_type.replace(/_/g, ' ')}`,
          description: m.subject || 'Agent update',
          createdAt: m.created_at,
          severity: m.priority === 'critical' ? 'critical' : 'info',
          link: '/agents',
        });
      }
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    setNotifications(items.slice(0, 50));
    setIsLoading(false);
  }, [user, prefs]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, () => fetchAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'risk_events' }, () => fetchAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_messages' }, () => fetchAll())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchAll]);

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString();
    localStorage.setItem(LAST_READ_KEY, now);
    setLastRead(now);
  }, []);

  const unreadCount = notifications.filter(
    (n) => new Date(n.createdAt).getTime() > new Date(lastRead).getTime()
  ).length;

  return { notifications, unreadCount, isLoading, markAllRead, refetch: fetchAll, lastRead };
}

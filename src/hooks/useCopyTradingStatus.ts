import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CopyTradingStatus {
  enabled: boolean;
  followedTraders: number;
  signals24h: number;
  copied24h: number;
  openMirrorPositions: number;
  lastSignalAt: Date | null;
  isLoading: boolean;
}

export function useCopyTradingStatus(): CopyTradingStatus & { refetch: () => void } {
  const [state, setState] = useState<CopyTradingStatus>({
    enabled: false,
    followedTraders: 0,
    signals24h: 0,
    copied24h: 0,
    openMirrorPositions: 0,
    lastSignalAt: null,
    isLoading: true,
  });

  const load = useCallback(async () => {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [settings, follows, signals, mirrors, lastSignal] = await Promise.all([
      supabase
        .from('copy_trading_settings')
        .select('enabled, auto_copy')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('followed_traders')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_active', true),
      supabase
        .from('copy_trade_signals')
        .select('status')
        .eq('user_id', userId)
        .gte('created_at', since),
      supabase
        .from('positions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('mirror_only', true),
      supabase
        .from('copy_trade_signals')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const rows = signals.data || [];
    setState({
      enabled: Boolean(settings.data?.enabled),
      followedTraders: follows.count || 0,
      signals24h: rows.length,
      copied24h: rows.filter((r) => r.status === 'copied').length,
      openMirrorPositions: mirrors.count || 0,
      lastSignalAt: lastSignal.data?.created_at ? new Date(lastSignal.data.created_at) : null,
      isLoading: false,
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    const channel = supabase
      .channel('copy-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'copy_trade_signals' }, () => load())
      .subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { ...state, refetch: load };
}

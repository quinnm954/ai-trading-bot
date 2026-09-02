import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Last time the server-side exit manager (auto-take-profit) touched this account.
 * It refreshes every open position's price each cycle, so the newest
 * positions.updated_at is a reliable "exit checks are alive" heartbeat.
 */
export function useLastExitCheck() {
  const { user } = useAuth();
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [hasOpenPositions, setHasOpenPositions] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('positions')
      .select('updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1);

    const row = data?.[0];
    setHasOpenPositions(!!row);
    setLastCheck(row?.updated_at ? new Date(row.updated_at) : null);
  }, [user]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 20000);
    return () => clearInterval(id);
  }, [fetch]);

  const staleMinutes = lastCheck ? (Date.now() - lastCheck.getTime()) / 60000 : null;

  return {
    lastCheck,
    hasOpenPositions,
    staleMinutes,
    isStale: staleMinutes !== null && staleMinutes > 5,
  };
}

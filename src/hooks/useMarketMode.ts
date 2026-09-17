import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type MarketMode = 'crypto' | 'stocks';

/**
 * Which asset class this account actively trades. Crypto is the default and is
 * unaffected by the stock path; only one class is active at a time.
 */
export function useMarketMode() {
  const { user } = useAuth();
  const [mode, setMode] = useState<MarketMode>('crypto');
  const [hasAlpacaKeys, setHasAlpacaKeys] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: settings }, { data: creds }] = await Promise.all([
      supabase.from('ai_settings').select('market_mode').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('broker_credentials')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'alpaca')
        .maybeSingle(),
    ]);
    setMode((settings?.market_mode as MarketMode) ?? 'crypto');
    setHasAlpacaKeys(!!creds);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeMode = useCallback(
    async (next: MarketMode) => {
      if (!user) return { error: 'Not signed in' };
      setSaving(true);
      const previous = mode;
      setMode(next);
      const { error } = await supabase
        .from('ai_settings')
        .update({ market_mode: next })
        .eq('user_id', user.id);
      setSaving(false);
      if (error) {
        setMode(previous);
        return { error: error.message };
      }
      return {};
    },
    [user, mode],
  );

  return { mode, hasAlpacaKeys, loading, saving, changeMode, reload: load };
}

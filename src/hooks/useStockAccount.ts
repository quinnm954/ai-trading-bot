import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface StockPositionRow {
  id: string;
  symbol: string;
  quantity: number;
  avg_entry_price: number;
  current_price: number | null;
  unrealized_pnl: number | null;
}

export interface StockAccountSnapshot {
  /** True when the numbers come from the in-app simulated paper account. */
  isPaper: boolean;
  /** Paper: always true once a paper account exists. Live: an Alpaca account is synced. */
  connected: boolean;
  /** Alpaca keys are saved — needed for market data in both modes. */
  hasKeys: boolean;
  balance: number;
  buyingPower: number;
  equity: number;
  lastSyncedAt: string | null;
  positions: StockPositionRow[];
  positionsValue: number;
  unrealizedPnl: number;
}

const EMPTY: StockAccountSnapshot = {
  isPaper: true,
  connected: false,
  hasKeys: false,
  balance: 0,
  buyingPower: 0,
  equity: 0,
  lastSyncedAt: null,
  positions: [],
  positionsValue: 0,
  unrealizedPnl: 0,
};

/**
 * Stock account snapshot.
 *
 * Paper mode reads the app's own simulated paper account (the same table crypto
 * paper trading uses) — nothing is read from or placed on Alpaca's paper account.
 * Live mode reads whatever the server last reconciled with the real Alpaca account.
 */
export function useStockAccount() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<StockAccountSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;

    const { data: settings } = await supabase
      .from('ai_settings')
      .select('trading_mode')
      .eq('user_id', user.id)
      .maybeSingle();

    const isPaper = settings?.trading_mode !== 'live';

    const [{ data: paper }, { data: account }, { data: creds }, { data: positions }] = await Promise.all([
      supabase
        .from('paper_account')
        .select('balance, initial_balance, updated_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('live_account')
        .select('balance, buying_power, equity, last_synced_at')
        .eq('user_id', user.id)
        .eq('provider', 'alpaca')
        .maybeSingle(),
      supabase
        .from('broker_credentials')
        .select('id')
        .eq('user_id', user.id)
        .eq('provider', 'alpaca')
        .maybeSingle(),
      supabase
        .from('positions')
        .select('id, symbol, quantity, avg_entry_price, current_price, unrealized_pnl')
        .eq('user_id', user.id)
        .eq('market_type', 'stocks')
        .eq('is_paper', isPaper)
        .order('symbol'),
    ]);

    const rows = (positions ?? []) as StockPositionRow[];
    const positionsValue = rows.reduce(
      (sum, p) => sum + Number(p.quantity) * Number(p.current_price ?? p.avg_entry_price),
      0,
    );
    const unrealizedPnl = rows.reduce((sum, p) => sum + Number(p.unrealized_pnl ?? 0), 0);
    const paperCash = Number(paper?.balance ?? 0);

    setSnapshot({
      isPaper,
      connected: isPaper ? !!paper : !!account,
      hasKeys: !!creds,
      balance: isPaper ? paperCash : Number(account?.balance ?? 0),
      buyingPower: isPaper ? paperCash : Number(account?.buying_power ?? 0),
      equity: isPaper ? paperCash + positionsValue : Number(account?.equity ?? 0),
      lastSyncedAt: isPaper ? paper?.updated_at ?? null : account?.last_synced_at ?? null,
      positions: rows,
      positionsValue,
      unrealizedPnl,
    });
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return { ...snapshot, loading, reload: load };
}

/** True during US regular trading hours (09:30–16:00 ET, weekdays). */
export function isRegularSessionNow(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  if (weekday === 'Sat' || weekday === 'Sun') return false;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

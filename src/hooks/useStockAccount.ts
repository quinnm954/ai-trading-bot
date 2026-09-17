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
  connected: boolean;
  balance: number;
  buyingPower: number;
  equity: number;
  lastSyncedAt: string | null;
  positions: StockPositionRow[];
  positionsValue: number;
  unrealizedPnl: number;
}

const EMPTY: StockAccountSnapshot = {
  connected: false,
  balance: 0,
  buyingPower: 0,
  equity: 0,
  lastSyncedAt: null,
  positions: [],
  positionsValue: 0,
  unrealizedPnl: 0,
};

/**
 * The connected Alpaca account and its stock positions.
 *
 * Reads only what the balance sync already writes, so nothing here depends on the
 * browser being open — the numbers are whatever the server last reconciled.
 */
export function useStockAccount() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<StockAccountSnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const [{ data: account }, { data: positions }] = await Promise.all([
      supabase
        .from('live_account')
        .select('balance, buying_power, equity, last_synced_at')
        .eq('user_id', user.id)
        .eq('provider', 'alpaca')
        .maybeSingle(),
      supabase
        .from('positions')
        .select('id, symbol, quantity, avg_entry_price, current_price, unrealized_pnl')
        .eq('user_id', user.id)
        .eq('market_type', 'stocks')
        .order('symbol'),
    ]);

    const rows = (positions ?? []) as StockPositionRow[];
    const positionsValue = rows.reduce(
      (sum, p) => sum + Number(p.quantity) * Number(p.current_price ?? p.avg_entry_price),
      0,
    );

    setSnapshot({
      connected: !!account,
      balance: Number(account?.balance ?? 0),
      buyingPower: Number(account?.buying_power ?? 0),
      equity: Number(account?.equity ?? 0),
      lastSyncedAt: account?.last_synced_at ?? null,
      positions: rows,
      positionsValue,
      unrealizedPnl: rows.reduce((sum, p) => sum + Number(p.unrealized_pnl ?? 0), 0),
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

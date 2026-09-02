import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { solveExitGeometry, type ExitGeometry } from '@/lib/exitGeometry';

export interface CapitalPlannerStats {
  /** Solved exit geometry currently in force (net win/loss, breakeven win rate). */
  geo: ExitGeometry;
  /** Measured win rate over the trailing sample, in percent. */
  winRatePct: number;
  /** Number of closed trades in the trailing sample. */
  sampleSize: number;
  /** Closed trades per day measured over the sample window. */
  tradesPerDay: number;
  /** Concurrent position slots actually enforced (min of all caps). */
  slots: number;
  /** Share of capital deployable at once, in percent. */
  capitalUsagePct: number;
  /** Average notional per position as a percent of capital basis. */
  notionalPctPerSlot: number;
  /** Capital basis the engine sizes from (initial deposit unless reinvesting). */
  capitalBasis: number;
}

const SAMPLE_DAYS = 30;
const HARD_MAX_CONCURRENT = 12; // mirrors SCALP_MAX_CONCURRENT in the engine

export function useCapitalPlanner(isPaper: boolean) {
  const { user } = useAuth();
  const [stats, setStats] = useState<CapitalPlannerStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const since = new Date(Date.now() - SAMPLE_DAYS * 86400_000).toISOString();

    const [scalpRes, aiRes, paperRes, tradesRes] = await Promise.all([
      supabase
        .from('scalp_settings')
        .select('max_concurrent_positions, max_capital_usage_pct, take_profit_pct, hard_stop_loss_pct')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase
        .from('ai_settings')
        .select('max_concurrent_trades, max_capital_usage, max_position_size, live_initial_investment')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('paper_account').select('initial_balance, balance').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('trades')
        .select('pnl, quantity, entry_price, closed_at')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper)
        .eq('status', 'closed')
        .gte('closed_at', since)
        .order('closed_at', { ascending: false })
        .limit(500),
    ]);

    const scalp = scalpRes.data;
    const ai = aiRes.data;
    const trades = tradesRes.data ?? [];

    const geo = solveExitGeometry(scalp?.take_profit_pct, scalp?.hard_stop_loss_pct);

    const wins = trades.filter(t => Number(t.pnl || 0) > 0).length;
    const winRatePct = trades.length ? (wins / trades.length) * 100 : 0;

    // Trades per day over the actual span covered by the sample (floored at one day so a
    // single burst of closes can't imply hundreds of trades per day).
    const stamps = trades
      .map(t => (t.closed_at ? new Date(t.closed_at).getTime() : 0))
      .filter(Boolean)
      .sort((a, b) => a - b);
    const spanDays = stamps.length > 1 ? (stamps[stamps.length - 1] - stamps[0]) / 86400_000 : 0;
    const tradesPerDay = trades.length ? trades.length / Math.max(spanDays, 1) : 0;

    const slots = Math.min(
      Number(scalp?.max_concurrent_positions) || HARD_MAX_CONCURRENT,
      Number(ai?.max_concurrent_trades) || HARD_MAX_CONCURRENT,
      HARD_MAX_CONCURRENT,
    );
    const capitalUsagePct = Number(scalp?.max_capital_usage_pct ?? ai?.max_capital_usage ?? 80);

    const capitalBasis = isPaper
      ? Number(paperRes.data?.initial_balance || paperRes.data?.balance || 0)
      : Number(ai?.live_initial_investment || 0);

    // Notional per slot: what the engine will actually deploy per position, capped by the
    // user's max position size and by an even split of the deployable capital.
    const maxPositionPct = Number(ai?.max_position_size ?? 10);
    const evenSplitPct = capitalUsagePct / Math.max(slots, 1);
    const notionalPctPerSlot = Math.min(maxPositionPct, evenSplitPct);

    setStats({
      geo,
      winRatePct,
      sampleSize: trades.length,
      tradesPerDay,
      slots,
      capitalUsagePct,
      notionalPctPerSlot,
      capitalBasis,
    });
    setLoading(false);
  }, [user, isPaper]);

  useEffect(() => {
    setLoading(true);
    fetchStats();
    const id = setInterval(fetchStats, 60_000);
    return () => clearInterval(id);
  }, [fetchStats]);

  return { stats, loading, refresh: fetchStats };
}

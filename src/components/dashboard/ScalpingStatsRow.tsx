import { useEffect, useState } from 'react';
import { Trophy, TrendingDown, Cpu, Activity, Radio, Shield } from 'lucide-react';
import { StatCard } from './StatCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface ScalpingStats {
  winRate: number;
  totalClosed: number;
  maxDrawdown: number;
  activeStrategy: string;
  regime: string;
  riskExposurePct: number;
  lastSignalScore: number | null;
  lastSignalAt: Date | null;
  lastSignalSymbol: string | null;
}

export function ScalpingStatsRow() {
  const { user } = useAuth();
  const [s, setS] = useState<ScalpingStats>({
    winRate: 0,
    totalClosed: 0,
    maxDrawdown: 0,
    activeStrategy: '—',
    regime: 'ranging',
    riskExposurePct: 0,
    lastSignalScore: null,
    lastSignalAt: null,
    lastSignalSymbol: null,
  });

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    const load = async () => {
      const aiSettingsRes = await supabase.from('ai_settings')
        .select('current_regime, current_drawdown, max_drawdown, trading_mode')
        .eq('user_id', user.id).maybeSingle();
      const currentRegime = aiSettingsRes.data?.current_regime ?? 'ranging';
      const isPaper = (aiSettingsRes.data?.trading_mode ?? 'paper') === 'paper';

      const [paperRes, liveRes, tradesRes, posRes, sigRes, perfRes] = await Promise.all([
        supabase.from('paper_account').select('balance').eq('user_id', user.id).maybeSingle(),
        supabase.from('live_account').select('balance, equity').eq('user_id', user.id),
        supabase.from('trades').select('pnl').eq('user_id', user.id).eq('status', 'closed').eq('is_paper', isPaper).limit(500),
        supabase.from('positions').select('quantity, current_price, avg_entry_price').eq('user_id', user.id).eq('is_paper', isPaper),
        supabase.from('signal_scores').select('total_score, symbol, created_at')
          .eq('user_id', user.id).order('created_at', { ascending: false }).limit(1),
        supabase.from('strategy_performance').select('strategy, score, enabled, market_regime')
          .eq('user_id', user.id).eq('enabled', true).eq('market_regime', currentRegime)
          .order('score', { ascending: false }).limit(1),
      ]);

      if (!mounted) return;

      const trades = tradesRes.data || [];
      const wins = trades.filter(t => Number(t.pnl) > 0).length;
      const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;

      const positions = posRes.data || [];
      const positionsValue = positions.reduce(
        (sum, p) => sum + Number(p.quantity) * Number(p.current_price || p.avg_entry_price), 0
      );
      let equity = 0;
      if (isPaper) {
        equity = Number(paperRes.data?.balance ?? 0) + positionsValue;
      } else {
        const liveEquity = (liveRes.data ?? []).reduce((sum, a) => sum + Number(a.equity || 0), 0);
        const liveCash = (liveRes.data ?? []).reduce((sum, a) => sum + Number(a.balance || 0), 0);
        equity = liveEquity > 0 ? liveEquity : liveCash + positionsValue;
      }
      const riskExposurePct = equity > 0 ? (positionsValue / equity) * 100 : 0;

      const lastSig = sigRes.data?.[0];

      setS({
        winRate,
        totalClosed: trades.length,
        maxDrawdown: Number(aiSettingsRes.data?.current_drawdown ?? 0),
        activeStrategy: perfRes.data?.[0]?.strategy ?? '—',
        regime: aiSettingsRes.data?.current_regime ?? 'ranging',
        riskExposurePct,
        lastSignalScore: lastSig ? Number(lastSig.total_score) : null,
        lastSignalAt: lastSig?.created_at ? new Date(lastSig.created_at) : null,
        lastSignalSymbol: lastSig?.symbol ?? null,
      });
    };

    load();
    const i = setInterval(load, 10000);

    const ch = supabase
      .channel(`scalping-stats-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signal_scores', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();

    return () => { mounted = false; clearInterval(i); supabase.removeChannel(ch); };
  }, [user]);

  const regimeLabel = (r: string) =>
    ({ trending: 'Trending', ranging: 'Ranging', high_volatility: 'High Vol', low_volatility: 'Low Vol', news_driven: 'News' } as any)[r] ?? r;

  const lastSignalLabel = s.lastSignalAt
    ? `${s.lastSignalSymbol} · ${Math.round((Date.now() - s.lastSignalAt.getTime()) / 60000)}m ago`
    : 'No signals yet';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      <StatCard
        title="Win Rate"
        value={`${s.winRate.toFixed(1)}%`}
        icon={Trophy}
        changeLabel={`${s.totalClosed} closed trades`}
      />
      <StatCard
        title="Max Drawdown"
        value={`${s.maxDrawdown.toFixed(2)}%`}
        icon={TrendingDown}
        trend={s.maxDrawdown > 10 ? 'down' : 'neutral'}
        changeLabel="From peak equity"
      />
      <StatCard
        title="Active Strategy"
        value={s.activeStrategy}
        icon={Cpu}
        changeLabel={`Auto-selected for ${regimeLabel(s.regime).toLowerCase()} regime`}
      />
      <StatCard
        title="Market Regime"
        value={regimeLabel(s.regime)}
        icon={Activity}
        changeLabel="Volatility / trend"
      />
      <StatCard
        title="Last Signal"
        value={s.lastSignalScore !== null ? `${s.lastSignalScore}/100` : '—'}
        icon={Radio}
        trend={s.lastSignalScore !== null && s.lastSignalScore >= 75 ? 'up' : 'neutral'}
        changeLabel={lastSignalLabel}
      />
      <StatCard
        title="Risk Exposure"
        value={`${s.riskExposurePct.toFixed(1)}%`}
        icon={Shield}
        trend={s.riskExposurePct > 80 ? 'down' : 'neutral'}
        changeLabel="Capital in positions"
      />
    </div>
  );
}

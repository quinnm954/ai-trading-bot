import { useEffect, useState } from 'react';
import { Shield, Lock, Loader2, Info, Bot, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRiskManager } from '@/hooks/useRiskManager';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ReinvestProfitsToggle } from './ReinvestProfitsToggle';
import { WideStopModeToggle } from './WideStopModeToggle';
import {
  MIN_REWARD_RISK,
  ROUND_TRIP_FEE_PCT,
  WIDE_MAX_HOLD_MINUTES,
  WIDE_STOP_ATR_MULT,
  WIDE_STOP_MAX_PCT,
  WIDE_STOP_MIN_PCT,
  WIDE_TP_GROSS_PCT,
  solveExitGeometry,
  solveWideGeometry,
} from '@/lib/exitGeometry';

// =============================================================================
// Risk Settings Panel — STRICT, NON-ADJUSTABLE PARAMETERS
// Exit geometry shown here is the ACTIVE geometry the engine will apply on the
// next entry (wide-stop swing mode vs tight mode), not the raw stored columns.
// =============================================================================

// Locked house parameters (must mirror the engine's enforced caps).
export const STRICT_RISK = {
  maxPositionSize: 15,
  maxDailyLoss: 4,
  weeklyLossLimit: 12,
  maxDrawdown: 25,
  maxConcurrentTrades: 12,
  maxCapitalUsage: 85,
  maxLeverage: 1,
  take_profit_pct: 3.36,
  trailing_drop_pct: 0.4,
  hard_stop_loss_pct: 0.8,
  entry_min_5m_pct: 0.3,
  entry_min_15m_pct: 0.3,
  entry_min_1h_pct: 0.3,
  entry_min_24h_pct: 0.3,
} as const;

type LockedRow = {
  label: string;
  value: string;
  description: string;
  aiRange?: string;
};

const LOSS_ROWS: LockedRow[] = [
  { label: 'Max daily loss', value: '4%', description: 'Trading halts for the day at this loss.', aiRange: 'AI may tighten, never below a 3% floor' },
  { label: 'Max weekly loss', value: '12%', description: 'Trading halts for the week at this loss.' },
  { label: 'Max drawdown (kill switch)', value: '25%', description: 'Kill switch trips on drawdown from peak equity.' },
];

const ENTRY_ROWS: LockedRow[] = [
  { label: 'Min 5m / 15m momentum', value: '0.30%', description: 'Entry quality gate on short-term momentum.', aiRange: 'AI may raise up to 0.6%' },
  { label: 'Min 1h / 24h momentum', value: '0.30%', description: 'Entry quality gate on trend momentum.', aiRange: 'AI may raise up to 0.8%' },
  { label: 'Target reachability', value: '1.5x from 24h range', description: 'A candidate must plausibly reach the target inside its recent range.' },
];

function Section({ title, rows }: { title: string; rows: LockedRow[] }) {
  return (
    <div className="mt-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">{title}</p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 py-3 border-b border-border/40 last:border-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">{row.label}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button"><Info className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  </TooltipTrigger>
                  <TooltipContent><p className="max-w-xs text-xs">{row.description}</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {row.aiRange && (
              <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary">
                <Bot className="w-3 h-3" /> {row.aiRange}
              </span>
            )}
          </div>
          <span className="font-mono text-sm font-medium text-foreground whitespace-nowrap">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

interface StoredSettings {
  take_profit_pct: number | null;
  hard_stop_loss_pct: number | null;
  trailing_drop_pct: number | null;
  max_concurrent_positions: number | null;
  wide_stop_mode: boolean | null;
}

export function RiskSettingsPanel() {
  const { user } = useAuth();
  const { riskStatus, isLoading } = useRiskManager();
  const [stored, setStored] = useState<StoredSettings | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('scalp_settings')
        .select('take_profit_pct, hard_stop_loss_pct, trailing_drop_pct, max_concurrent_positions, wide_stop_mode')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setStored(data as unknown as StoredSettings);
    })();
  }, [user]);

  if (isLoading || !riskStatus) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ── ACTIVE geometry: what the engine will actually apply on the next entry ──
  const wide = stored?.wide_stop_mode !== false;
  const tightGeo = solveExitGeometry(stored?.take_profit_pct, stored?.hard_stop_loss_pct);
  // Wide stop is ATR-scaled per symbol, so show the clamp band and use the
  // midpoint for the derived net figures.
  const wideMid = solveWideGeometry(((WIDE_STOP_MIN_PCT + WIDE_STOP_MAX_PCT) / 2) / WIDE_STOP_ATR_MULT);
  const geo = wide ? wideMid : tightGeo;

  const slots = Number(stored?.max_concurrent_positions ?? STRICT_RISK.maxConcurrentTrades);
  const trailingValue = wide
    ? 'Disabled in wide-stop mode'
    : `${Number(stored?.trailing_drop_pct ?? STRICT_RISK.trailing_drop_pct).toFixed(2)}%`;
  const holdValue = wide
    ? `${Math.round(WIDE_MAX_HOLD_MINUTES / 60)}h max hold`
    : '12h max hold (24h in fee dead zone)';

  const stopValue = wide
    ? `-${WIDE_STOP_ATR_MULT}x ATR (${WIDE_STOP_MIN_PCT.toFixed(1)}%–${WIDE_STOP_MAX_PCT.toFixed(1)}%)`
    : `-${geo.stopLossPct.toFixed(2)}%`;

  const EXIT_ROWS: LockedRow[] = [
    {
      label: 'Take-profit target',
      value: `+${geo.takeProfitPct.toFixed(2)}%`,
      description: wide
        ? `Wide-stop swing target. Fixed at +${WIDE_TP_GROSS_PCT.toFixed(2)}% gross while wide-stop mode is on.`
        : 'Solved so a win clears 1.6:1 NET of the 0.8% fee round trip.',
    },
    {
      label: 'Hard stop-loss',
      value: stopValue,
      description: wide
        ? `Stop is ${WIDE_STOP_ATR_MULT}x the symbol's ATR, clamped to ${WIDE_STOP_MIN_PCT}%–${WIDE_STOP_MAX_PCT}% so net reward:risk still clears ${MIN_REWARD_RISK}:1.`
        : 'Fixed maximum risk per trade. Never widened.',
    },
    {
      label: 'Trailing drop from peak',
      value: trailingValue,
      description: wide
        ? 'Wide-stop swings run to target, stop or hold expiry — trailing is off so winners are not cut early.'
        : 'Armed only past breakeven + fees.',
      aiRange: wide ? undefined : 'AI may set 0.3%–0.6%',
    },
    { label: 'Max hold', value: holdValue, description: 'Position is force-closed at hold expiry regardless of P&L.' },
  ];

  const CAPITAL_ROWS: LockedRow[] = [
    { label: 'Max position size', value: '15% of equity', description: 'Hard notional cap per position. The engine never exceeds it.' },
    { label: 'Max capital usage', value: '85%', description: 'Total deployable capital across all open positions (of the capital basis).' },
    { label: 'Max concurrent trades', value: String(slots), description: 'Simultaneous open AI positions, as currently configured for this account.', aiRange: 'AI may reduce to 6 in poor regimes' },
    { label: 'Max leverage', value: '1x (spot)', description: 'Leverage is disabled to keep drawdown bounded.' },
  ];

  return (
    <div className="glass-panel p-6">
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/20">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Risk & Engine Parameters</h3>
            <p className="text-sm text-muted-foreground">Locked to the profit goal. The AI tunes within bounds.</p>
          </div>
        </div>
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-secondary/60 text-xs text-muted-foreground whitespace-nowrap">
          <Lock className="w-3 h-3" /> Enforced
        </span>
      </div>

      {/* Capital basis — profits stay out of play unless explicitly reinvested */}
      <ReinvestProfitsToggle />
      <WideStopModeToggle />

      <div className={cn('mt-4 p-3 rounded-lg border text-xs space-y-1', 'bg-success/10 border-success/30 text-success')}>
        <p className="font-medium flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5" />
          Active geometry ({wide ? 'wide-stop swing mode' : 'tight mode'}): +{geo.takeProfitPct.toFixed(2)}% target / {stopValue} stop
          → NET {geo.netRewardRisk.toFixed(2)}:1
        </p>
        <p className="text-muted-foreground">
          After the {ROUND_TRIP_FEE_PCT}% fee round trip a win nets +{geo.netWinPct.toFixed(2)}% and a loss costs -{geo.netLossPct.toFixed(2)}%
          {wide ? ' at the midpoint of the ATR stop band' : ''}. Break-even win rate:{' '}
          <strong>{geo.breakevenWinRatePct.toFixed(0)}%</strong>. Minimum enforced reward:risk is {MIN_REWARD_RISK}:1.
        </p>
      </div>

      <Section title="Capital & sizing" rows={CAPITAL_ROWS} />
      <Section title="Loss limits" rows={LOSS_ROWS} />
      <Section title="Exit geometry (active)" rows={EXIT_ROWS} />
      <Section title="Entry quality" rows={ENTRY_ROWS} />

      {/* Goal alignment — what the active geometry implies per $10k of capital basis */}
      {(() => {
        const perTradePctOfBasis = (STRICT_RISK.maxCapitalUsage / 100) * (STRICT_RISK.maxPositionSize / 100) * 100;
        const basis = 10000;
        const stake = basis * (perTradePctOfBasis / 100);
        const winUsd = stake * (geo.netWinPct / 100);
        const lossUsd = stake * (geo.netLossPct / 100);
        const wr = (geo.breakevenWinRatePct + 10) / 100;
        const evPerTrade = wr * winUsd - (1 - wr) * lossUsd;
        return (
          <div className="mt-5 p-3 rounded-lg border border-primary/30 bg-primary/10 text-xs space-y-1">
            <p className="font-medium text-foreground">Goal alignment (per $10,000 capital basis)</p>
            <p className="text-muted-foreground">
              Each trade stakes {perTradePctOfBasis.toFixed(1)}% of basis (${stake.toFixed(0)}): a win nets
              <strong> +${winUsd.toFixed(2)}</strong>, a loss costs <strong>-${lossUsd.toFixed(2)}</strong>.
              At a {(geo.breakevenWinRatePct + 10).toFixed(0)}% win rate that is ~${evPerTrade.toFixed(2)} expected per trade,
              so hitting a $200/day target needs roughly {Math.max(1, Math.ceil(200 / Math.max(evPerTrade, 0.01)))} completed
              trades per day at this basis — fewer as the basis grows. No configuration guarantees profit.
            </p>
          </div>
        );
      })()}

      {stored && (
        <div className="mt-5 p-3 rounded-lg bg-secondary/40 text-xs text-muted-foreground">
          <p className="font-medium text-foreground mb-1 flex items-center gap-1">
            <Bot className="w-3.5 h-3.5 text-primary" /> Stored tight-mode values
          </p>
          <p className="font-mono">
            target +{tightGeo.takeProfitPct.toFixed(2)}% · stop -{tightGeo.stopLossPct.toFixed(2)}% ·
            trail {Number(stored.trailing_drop_pct ?? STRICT_RISK.trailing_drop_pct).toFixed(2)}% · slots {slots}
          </p>
          <p className="mt-1">
            {wide
              ? 'Wide-stop mode is on, so these stored values are dormant — open positions use the active geometry above.'
              : 'Wide-stop mode is off, so these stored values are the active geometry.'}
          </p>
        </div>
      )}

      <div className="mt-4 p-4 rounded-lg bg-muted/50">
        <p className="text-xs text-muted-foreground">
          <strong>Why locked:</strong> loosening any of these breaks the net reward:risk math the profit goal depends on.
          The AI may tighten limits or shift within the ranges shown, but it can never exceed them. No configuration guarantees profit.
        </p>
      </div>
    </div>
  );
}

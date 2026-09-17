// Run parameters for a backtest. Defaults are read from the requesting account's own
// live settings so a "baseline" run is literally the production configuration, and any
// field can be overridden to test a proposed change against the same history.

import { MAX_RISK_PCT } from "../_shared/exit-geometry.ts";
import { ROUND_TRIP_FEE_PCT } from "../_shared/exit-geometry.ts";
import { PLAYBOOK_TUNING_DEFAULTS, type PlaybookTuning } from "../_shared/entry-playbook.ts";
import { TAPE_DEFAULTS, type TapeThresholds } from "../_shared/tape-gate.ts";
import { GEOMETRY_DEFAULTS, type GeometryKnobs } from "./geometry.ts";

export interface BacktestParams {
  /** Days of history to replay. */
  days: number;
  /** How many Coinbase markets (most liquid first) to include. */
  universeSize: number;
  initialBalance: number;
  maxCapitalUsagePct: number;
  maxPositionSizePct: number;
  maxConcurrent: number;
  /** Wide-stop swing mode geometry instead of the per-coin adaptive geometry. */
  wideStopMode: boolean;
  /** Account's configured hard stop, fed to solveAdaptiveGeometry as the tuned stop. */
  stopPct: number;
  tape: TapeThresholds;
  /** Stop cap / payoff floor being tested (defaults = the live constants). */
  geometry: GeometryKnobs;
  playbookTuning: Required<PlaybookTuning>;
  /** Round-trip fee charged on every simulated trade. */
  feePct: number;
  /** How a bar whose range spans both stop and target is resolved. */
  intrabarTieBreak: 'stop_first';
}

export const HARD_LIMITS = {
  maxDays: 120,
  minDays: 30,
  maxUniverse: 60,
  minUniverse: 5,
};

/** Build params from the account's live settings, then apply any explicit overrides. */
export function resolveParams(
  aiSettings: Record<string, unknown> | null,
  scalpSettings: Record<string, unknown> | null,
  overrides: Record<string, unknown> = {},
): BacktestParams {
  const numOr = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const base: BacktestParams = {
    days: 90,
    universeSize: 30,
    initialBalance: 100_000,
    maxCapitalUsagePct: numOr(aiSettings?.max_capital_usage, 85),
    maxPositionSizePct: numOr(aiSettings?.max_position_size, 15),
    maxConcurrent: Math.round(numOr(aiSettings?.max_concurrent_trades, 12)),
    wideStopMode: Boolean(scalpSettings?.wide_stop_mode ?? false),
    stopPct: numOr(scalpSettings?.hard_stop_loss_pct, MAX_RISK_PCT),
    tape: { ...TAPE_DEFAULTS },
    geometry: { ...GEOMETRY_DEFAULTS },
    playbookTuning: {
      minScore: numOr(scalpSettings?.playbook_min_score, PLAYBOOK_TUNING_DEFAULTS.minScore),
      minVolumeRatio: numOr(scalpSettings?.playbook_min_volume_ratio, PLAYBOOK_TUNING_DEFAULTS.minVolumeRatio),
      maxPercentB: numOr(scalpSettings?.playbook_max_percent_b, PLAYBOOK_TUNING_DEFAULTS.maxPercentB),
      rsiMax: numOr(scalpSettings?.playbook_rsi_max, PLAYBOOK_TUNING_DEFAULTS.rsiMax),
      maxChase5m: numOr(scalpSettings?.playbook_max_chase_5m_pct, PLAYBOOK_TUNING_DEFAULTS.maxChase5m),
    },
    feePct: ROUND_TRIP_FEE_PCT,
    intrabarTieBreak: 'stop_first',
  };

  const o = overrides ?? {};
  const out: BacktestParams = {
    ...base,
    days: clamp(numOr(o.days, base.days), HARD_LIMITS.minDays, HARD_LIMITS.maxDays),
    universeSize: Math.round(clamp(numOr(o.universeSize, base.universeSize), HARD_LIMITS.minUniverse, HARD_LIMITS.maxUniverse)),
    initialBalance: numOr(o.initialBalance, base.initialBalance),
    maxCapitalUsagePct: numOr(o.maxCapitalUsagePct, base.maxCapitalUsagePct),
    maxPositionSizePct: numOr(o.maxPositionSizePct, base.maxPositionSizePct),
    maxConcurrent: Math.round(numOr(o.maxConcurrent, base.maxConcurrent)),
    wideStopMode: typeof o.wideStopMode === 'boolean' ? o.wideStopMode : base.wideStopMode,
    stopPct: numOr(o.stopPct, base.stopPct),
    feePct: numOr(o.feePct, base.feePct),
    tape: {
      min24hPct: finiteOr((o.tape as Record<string, unknown>)?.min24hPct, base.tape.min24hPct),
      min1hPct: finiteOr((o.tape as Record<string, unknown>)?.min1hPct, base.tape.min1hPct),
      minBreadth: finiteOr((o.tape as Record<string, unknown>)?.minBreadth, base.tape.minBreadth),
    },
    geometry: {
      maxRiskPct: numOr((o.geometry as Record<string, unknown>)?.maxRiskPct, base.geometry.maxRiskPct),
      minRewardRisk: numOr((o.geometry as Record<string, unknown>)?.minRewardRisk, base.geometry.minRewardRisk),
      minStopPct: numOr((o.geometry as Record<string, unknown>)?.minStopPct, base.geometry.minStopPct),
      tpFloorPct: numOr((o.geometry as Record<string, unknown>)?.tpFloorPct, base.geometry.tpFloorPct),
    },
    playbookTuning: {
      minScore: numOr((o.playbookTuning as Record<string, unknown>)?.minScore, base.playbookTuning.minScore),
      minVolumeRatio: numOr((o.playbookTuning as Record<string, unknown>)?.minVolumeRatio, base.playbookTuning.minVolumeRatio),
      maxPercentB: numOr((o.playbookTuning as Record<string, unknown>)?.maxPercentB, base.playbookTuning.maxPercentB),
      rsiMax: numOr((o.playbookTuning as Record<string, unknown>)?.rsiMax, base.playbookTuning.rsiMax),
      maxChase5m: numOr((o.playbookTuning as Record<string, unknown>)?.maxChase5m, base.playbookTuning.maxChase5m),
    },
  };
  return out;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function finiteOr(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

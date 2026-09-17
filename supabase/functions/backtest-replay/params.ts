// Run parameters for a backtest. Defaults are read from the requesting account's own
// live settings so a "baseline" run is literally the production configuration, and any
// field can be overridden to test a proposed change against the same history.

import { MAX_RISK_PCT } from "../_shared/exit-geometry.ts";
import { ROUND_TRIP_FEE_PCT } from "../_shared/exit-geometry.ts";
import { PLAYBOOK_TUNING_DEFAULTS, type PlaybookTuning } from "../_shared/entry-playbook.ts";
import { TAPE_DEFAULTS, type TapeThresholds } from "../_shared/tape-gate.ts";
import { GEOMETRY_DEFAULTS, type GeometryKnobs } from "./geometry.ts";
import { roundTripCostPct, type AssetClass, assetClassOf } from "../_shared/asset-class.ts";
import {
  STOCK_MIN_REWARD_RISK,
  STOCK_STOP_ATR_MULT,
  STOCK_STOP_MAX_PCT,
  STOCK_STOP_MIN_PCT,
  STOCK_TP_FLOOR_PCT,
  STOCK_MIN_HOLD_MINUTES,
  STOCK_MAX_HOLD_MINUTES,
} from "../_shared/stock-geometry.ts";
import {
  STOCK_TAPE_MIN_BREADTH,
  STOCK_TAPE_MIN_INDEX_PCT,
} from "../_shared/stock-tape.ts";
import {
  STOCK_PLAYBOOK_DEFAULTS,
  stockTuningFromSettings,
  type StockPlaybookTuning,
} from "../_shared/stock-playbook.ts";

export interface BacktestParams {
  /** Which asset class this run replays. Crypto is the default. */
  assetClass: AssetClass;
  /** Days of history to replay. */
  days: number;
  /** How many markets (most liquid first) to include. */
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
  /** Equity playbook thresholds. Only read by a stock run. */
  stockPlaybook: StockPlaybookTuning;
  /** Round-trip cost charged on every simulated trade (crypto fees, stock spread). */
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

  // Asset class comes from the override (a stock run is requested explicitly) or
  // from the account's own market mode, so a "baseline" run always mirrors what
  // the account actually trades.
  const assetClass: AssetClass = overrides?.assetClass
    ? assetClassOf(overrides.assetClass)
    : assetClassOf(aiSettings?.market_mode);
  const isStock = assetClass === 'stocks';

  const base: BacktestParams = {
    assetClass,
    days: 90,
    universeSize: 30,
    initialBalance: 100_000,
    maxCapitalUsagePct: numOr(aiSettings?.max_capital_usage, 85),
    maxPositionSizePct: numOr(aiSettings?.max_position_size, 15),
    maxConcurrent: Math.round(numOr(aiSettings?.max_concurrent_trades, 12)),
    // Wide-stop swing mode is a crypto-only contract.
    wideStopMode: isStock ? false : Boolean(scalpSettings?.wide_stop_mode ?? false),
    stopPct: isStock
      ? numOr(aiSettings?.stock_max_stop_pct, STOCK_STOP_MAX_PCT)
      : numOr(scalpSettings?.hard_stop_loss_pct, MAX_RISK_PCT),
    // Equities gate on index tape + breadth, not on a 24h/1h crypto read.
    tape: isStock
      ? { min24hPct: STOCK_TAPE_MIN_INDEX_PCT, min1hPct: STOCK_TAPE_MIN_INDEX_PCT, minBreadth: STOCK_TAPE_MIN_BREADTH }
      : { ...TAPE_DEFAULTS },
    geometry: isStock
      ? {
        maxRiskPct: numOr(aiSettings?.stock_max_stop_pct, STOCK_STOP_MAX_PCT),
        minRewardRisk: STOCK_MIN_REWARD_RISK,
        minStopPct: numOr(aiSettings?.stock_min_stop_pct, STOCK_STOP_MIN_PCT),
        tpFloorPct: STOCK_TP_FLOOR_PCT,
        costPct: roundTripCostPct('stocks'),
        stopAtrMult: numOr(aiSettings?.stock_stop_atr_mult, STOCK_STOP_ATR_MULT),
        minHoldMinutes: STOCK_MIN_HOLD_MINUTES,
        maxHoldMinutes: STOCK_MAX_HOLD_MINUTES,
      }
      : { ...GEOMETRY_DEFAULTS },
    playbookTuning: {
      minScore: numOr(scalpSettings?.playbook_min_score, PLAYBOOK_TUNING_DEFAULTS.minScore),
      minVolumeRatio: numOr(scalpSettings?.playbook_min_volume_ratio, PLAYBOOK_TUNING_DEFAULTS.minVolumeRatio),
      maxPercentB: numOr(scalpSettings?.playbook_max_percent_b, PLAYBOOK_TUNING_DEFAULTS.maxPercentB),
      rsiMax: numOr(scalpSettings?.playbook_rsi_max, PLAYBOOK_TUNING_DEFAULTS.rsiMax),
      maxChase5m: numOr(scalpSettings?.playbook_max_chase_5m_pct, PLAYBOOK_TUNING_DEFAULTS.maxChase5m),
    },
    stockPlaybook: {
      minScore: STOCK_PLAYBOOK_DEFAULTS.minScore,
      minRvol: STOCK_PLAYBOOK_DEFAULTS.minRvol,
      minRsDayPct: STOCK_PLAYBOOK_DEFAULTS.minRsDayPct,
      maxExtensionMult: STOCK_PLAYBOOK_DEFAULTS.maxExtensionMult,
      earningsBufferDays: STOCK_PLAYBOOK_DEFAULTS.earningsBufferDays,
      ...(isStock ? stockTuningFromSettings(aiSettings) : {}),
    },
    feePct: isStock ? roundTripCostPct('stocks') : ROUND_TRIP_FEE_PCT,
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
      costPct: finiteOr((o.geometry as Record<string, unknown>)?.costPct, base.geometry.costPct),
      stopAtrMult: numOr((o.geometry as Record<string, unknown>)?.stopAtrMult, base.geometry.stopAtrMult),
      minHoldMinutes: numOr((o.geometry as Record<string, unknown>)?.minHoldMinutes, base.geometry.minHoldMinutes),
      maxHoldMinutes: numOr((o.geometry as Record<string, unknown>)?.maxHoldMinutes, base.geometry.maxHoldMinutes),
    },

    playbookTuning: {
      minScore: numOr((o.playbookTuning as Record<string, unknown>)?.minScore, base.playbookTuning.minScore),
      minVolumeRatio: numOr((o.playbookTuning as Record<string, unknown>)?.minVolumeRatio, base.playbookTuning.minVolumeRatio),
      maxPercentB: numOr((o.playbookTuning as Record<string, unknown>)?.maxPercentB, base.playbookTuning.maxPercentB),
      rsiMax: numOr((o.playbookTuning as Record<string, unknown>)?.rsiMax, base.playbookTuning.rsiMax),
      maxChase5m: numOr((o.playbookTuning as Record<string, unknown>)?.maxChase5m, base.playbookTuning.maxChase5m),
    },
    stockPlaybook: {
      ...base.stockPlaybook,
      ...Object.fromEntries(
        Object.entries((o.stockPlaybook ?? {}) as Record<string, unknown>)
          .filter(([, v]) => Number.isFinite(Number(v)))
          .map(([k, v]) => [k, Number(v)]),
      ),
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

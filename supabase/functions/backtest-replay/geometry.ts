// ═══════════════════════════════════════════════════════════════════════════════
// 🧮 VARIANT GEOMETRY — the live exit solve, with its two constants made tunable
//
// The live engine hard-codes MAX_RISK_PCT (stop cap) and MIN_REWARD_RISK (net
// payoff floor) as module constants. To compare "wider stop" or "closer target"
// against the same history, the backtest re-implements ONLY the arithmetic of
// solveExitGeometry / solveAdaptiveGeometry with those two values injected.
//
// With the defaults passed in, this is bit-for-bit the live solve — the baseline
// run therefore still replays production exactly. Nothing here is imported by
// live trading code.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  ROUND_TRIP_FEE_PCT,
  TP_FLOOR_GROSS_PCT,
  MAX_RISK_PCT,
  MIN_REWARD_RISK,
  TUNED_STOP_MIN_PCT,
  ADAPTIVE_STOP_ATR_MULT,
  ADAPTIVE_MIN_HOLD_MINUTES,
  ADAPTIVE_MAX_HOLD_MINUTES,
  ADAPTIVE_REACH_FACTOR,
  PROFIT_LOCK_ARM_STOP_MULT,
  PROFIT_LOCK_GIVEBACK_STOP_MULT,
} from "../_shared/exit-geometry.ts";

export interface GeometryKnobs {
  /** Hard cap on the gross stop distance (live default 1.2%). */
  maxRiskPct: number;
  /** Net reward:risk the target must deliver after costs (live default 1.6). */
  minRewardRisk: number;
  /** Tightest stop allowed (live default 0.6%). */
  minStopPct: number;
  /** Absolute gross take-profit floor (live default 1.4%). */
  tpFloorPct: number;
  /**
   * Round-trip cost the target must clear. Crypto pays the 0.8% Coinbase round
   * trip; equities on Alpaca are commission-free, so a stock run passes its much
   * smaller spread allowance instead of inheriting the crypto fee.
   */
  costPct: number;
  /** ATR multiple used to size the stop (crypto and equities differ). */
  stopAtrMult: number;
  /** Hold window bounds in minutes. */
  minHoldMinutes: number;
  maxHoldMinutes: number;
}

export const GEOMETRY_DEFAULTS: GeometryKnobs = {
  maxRiskPct: MAX_RISK_PCT,
  minRewardRisk: MIN_REWARD_RISK,
  minStopPct: TUNED_STOP_MIN_PCT,
  tpFloorPct: TP_FLOOR_GROSS_PCT,
  costPct: ROUND_TRIP_FEE_PCT,
  stopAtrMult: ADAPTIVE_STOP_ATR_MULT,
  minHoldMinutes: ADAPTIVE_MIN_HOLD_MINUTES,
  maxHoldMinutes: ADAPTIVE_MAX_HOLD_MINUTES,
};

export interface VariantGeometry {
  stopLossPct: number;
  takeProfitPct: number;
  netWinPct: number;
  netLossPct: number;
  netRewardRisk: number;
  holdMinutes: number;
  reachable: boolean;
}

/** Gross take-profit needed for a stop to clear `minRewardRisk` net of costs. */
function requiredTp(stopPct: number, k: GeometryKnobs): number {
  const netLoss = Math.abs(stopPct) + k.costPct;
  return Math.max(k.tpFloorPct, k.costPct + k.minRewardRisk * netLoss);
}


/** Per-coin adaptive geometry with the stop cap and payoff floor injected. */
export function solveVariantAdaptive(
  hourlyAtrPct: number | null | undefined,
  tunedStopPct: number | null | undefined,
  k: GeometryKnobs,
): VariantGeometry {
  const atr = Number(hourlyAtrPct) > 0 ? Number(hourlyAtrPct) : 0;
  const tuned = Math.abs(Number(tunedStopPct)) > 0 ? Math.abs(Number(tunedStopPct)) : k.maxRiskPct;
  const raw = atr > 0 ? atr * ADAPTIVE_STOP_ATR_MULT : tuned;
  const minStop = Math.min(k.minStopPct, k.maxRiskPct);
  const stopLossPct = Math.min(k.maxRiskPct, Math.max(minStop, raw));
  const takeProfitPct = requiredTp(stopLossPct, k);

  const hoursToTarget = atr > 0 ? takeProfitPct / atr : Infinity;
  const neededMinutes = Number.isFinite(hoursToTarget)
    ? Math.ceil((hoursToTarget / ADAPTIVE_REACH_FACTOR) * 60)
    : ADAPTIVE_MAX_HOLD_MINUTES;
  const holdMinutes = Math.min(
    ADAPTIVE_MAX_HOLD_MINUTES,
    Math.max(ADAPTIVE_MIN_HOLD_MINUTES, neededMinutes),
  );

  const netLossPct = stopLossPct + ROUND_TRIP_FEE_PCT;
  const netWinPct = takeProfitPct - ROUND_TRIP_FEE_PCT;

  return {
    stopLossPct,
    takeProfitPct,
    netWinPct,
    netLossPct,
    netRewardRisk: netWinPct / netLossPct,
    holdMinutes,
    reachable: atr > 0 && takeProfitPct <= atr * (holdMinutes / 60) * ADAPTIVE_REACH_FACTOR,
  };
}

/** Profit lock derived from the trade's own stop distance (live multipliers). */
export function variantProfitLock(stopPct: number): { armPct: number; givebackPct: number } {
  const stop = Math.abs(stopPct) > 0 ? Math.abs(stopPct) : GEOMETRY_DEFAULTS.maxRiskPct;
  return {
    armPct: stop * PROFIT_LOCK_ARM_STOP_MULT,
    givebackPct: stop * PROFIT_LOCK_GIVEBACK_STOP_MULT,
  };
}

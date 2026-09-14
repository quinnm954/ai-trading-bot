/**
 * Client mirror of supabase/functions/_shared/exit-geometry.ts.
 *
 * The engine, the risk gate and the exit executor all solve the take-profit from the
 * fee-loaded stop so the NET reward:risk the account books equals MIN_REWARD_RISK.
 * The UI must present the same numbers, so the constants and the solver are mirrored
 * here rather than re-derived per component.
 */
export const ROUND_TRIP_FEE_PCT = 0.8; // 0.4% maker in + 0.4% maker out
export const MIN_REWARD_RISK = 1.6; // minimum NET reward:risk on any scalp
export const TP_FLOOR_GROSS_PCT = 1.4; // absolute gross take-profit floor
export const MAX_RISK_PCT = 1.2; // outer bound of the auto-tuned stop band
export const TUNED_STOP_MIN_PCT = 0.6; // tightest the tuner may go

// Profit lock + per-coin adaptive geometry (mirror of the shared module).
export const PROFIT_LOCK_ARM_STOP_MULT = 2.5;
export const PROFIT_LOCK_GIVEBACK_STOP_MULT = 0.6;
export const PROFIT_LOCK_ARM_PCT = MAX_RISK_PCT * PROFIT_LOCK_ARM_STOP_MULT;
export const PROFIT_LOCK_GIVEBACK_PCT = MAX_RISK_PCT * PROFIT_LOCK_GIVEBACK_STOP_MULT;

export function solveProfitLock(grossStopPct?: number | null): { armPct: number; givebackPct: number } {
  const stop = Math.abs(Number(grossStopPct)) > 0 ? Math.abs(Number(grossStopPct)) : MAX_RISK_PCT;
  return {
    armPct: stop * PROFIT_LOCK_ARM_STOP_MULT,
    givebackPct: stop * PROFIT_LOCK_GIVEBACK_STOP_MULT,
  };
}
export const ADAPTIVE_STOP_ATR_MULT = 1.4;
export const ADAPTIVE_MIN_HOLD_MINUTES = 360;
export const ADAPTIVE_MAX_HOLD_MINUTES = 1440;

export interface ExitGeometry {
  takeProfitPct: number;
  stopLossPct: number;
  netWinPct: number;
  netLossPct: number;
  netRewardRisk: number;
  /** Win rate at which this geometry breaks even, in percent. */
  breakevenWinRatePct: number;
}

export function requiredGrossTakeProfit(
  grossStopPct: number,
  minRewardRisk: number = MIN_REWARD_RISK,
): number {
  const netLoss = Math.abs(grossStopPct) + ROUND_TRIP_FEE_PCT;
  return ROUND_TRIP_FEE_PCT + minRewardRisk * netLoss;
}

export function solveExitGeometry(rawTpPct?: number | null, rawStopPct?: number | null): ExitGeometry {
  const requestedStop = Math.abs(Number(rawStopPct)) > 0 ? Math.abs(Number(rawStopPct)) : MAX_RISK_PCT;
  const stopLossPct = Math.min(requestedStop, MAX_RISK_PCT);

  const requestedTp = Number(rawTpPct) > 0 ? Number(rawTpPct) : 0;
  const takeProfitPct = Math.max(requestedTp, TP_FLOOR_GROSS_PCT, requiredGrossTakeProfit(stopLossPct));

  const netLossPct = stopLossPct + ROUND_TRIP_FEE_PCT;
  const netWinPct = takeProfitPct - ROUND_TRIP_FEE_PCT;

  return {
    takeProfitPct,
    stopLossPct,
    netWinPct,
    netLossPct,
    netRewardRisk: netWinPct / netLossPct,
    breakevenWinRatePct: (netLossPct / (netWinPct + netLossPct)) * 100,
  };
}

/** Expected net % per trade for a win rate (0-100) on the given geometry. */
export function expectancyPctPerTrade(winRatePct: number, geo: ExitGeometry): number {
  const w = Math.min(Math.max(winRatePct, 0), 100) / 100;
  return w * geo.netWinPct - (1 - w) * geo.netLossPct;
}

// ── Wide-stop swing mode (mirror of supabase/functions/_shared/exit-geometry.ts) ──
// Matches the engine: 7.68% gross nets 6.88% against a worst-case 4.3% fee-adjusted loss.
export const WIDE_TP_GROSS_PCT = 7.68;
export const WIDE_STOP_ATR_MULT = 3.5; // stop = 3.5 × HOURLY ATR% (clamped to the band below)
export const WIDE_STOP_MIN_PCT = 2.0;
export const WIDE_STOP_MAX_PCT = 3.5; // worst-case loss cap
export const WIDE_MAX_HOLD_MINUTES = 2880;


export function solveWideGeometry(atrPct?: number | null): ExitGeometry {
  const atr = Number(atrPct) > 0 ? Number(atrPct) : WIDE_STOP_MIN_PCT / WIDE_STOP_ATR_MULT;
  const stopLossPct = Math.min(WIDE_STOP_MAX_PCT, Math.max(WIDE_STOP_MIN_PCT, atr * WIDE_STOP_ATR_MULT));
  const takeProfitPct = WIDE_TP_GROSS_PCT;
  const netLossPct = stopLossPct + ROUND_TRIP_FEE_PCT;
  const netWinPct = takeProfitPct - ROUND_TRIP_FEE_PCT;
  return {
    takeProfitPct,
    stopLossPct,
    netWinPct,
    netLossPct,
    netRewardRisk: netWinPct / netLossPct,
    breakevenWinRatePct: (netLossPct / (netWinPct + netLossPct)) * 100,
  };
}

// Wide-mode intermediate exits — all disabled (mirror of the shared module). Wide swings
// run to the target or the stop; the trailing / breakeven / partial ladder clipped winners.
export const WIDE_TRAILING_ENABLED = false;
export const WIDE_TRAIL_ARM_PCT = 2.6;
export const WIDE_TRAIL_DROP_PCT = 0.7;

export const WIDE_BREAKEVEN_ENABLED = false;
export const WIDE_BREAKEVEN_ARM_PCT = 2.0;
export const WIDE_BREAKEVEN_FLOOR_PCT = 1.6;

export const WIDE_PARTIAL_TP_ENABLED = false;
export const WIDE_PARTIAL_TP_PCT = 2.5;
export const WIDE_PARTIAL_FRACTION = 0.5;

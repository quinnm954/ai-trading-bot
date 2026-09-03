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
export const MAX_RISK_PCT = 0.8; // hard cap on gross loss per trade

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
export const WIDE_TP_GROSS_PCT = 5.0;
export const WIDE_STOP_ATR_MULT = 2.5;
export const WIDE_STOP_MIN_PCT = 1.2;
export const WIDE_STOP_MAX_PCT = 1.8;
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

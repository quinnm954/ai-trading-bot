// ── Single source of truth for exit geometry (sizing + execution + risk gate) ──
//
// The 0.4% maker fee is paid on BOTH legs of a round trip, so it hits the winner
// and the loser in opposite directions:
//
//     net win  = grossTP   - roundTripFee
//     net loss = grossStop + roundTripFee
//
// A "gross 1.6:1" pair such as TP 1.28% / stop 0.80% therefore realizes
// +0.48% against -1.60% — a 0.30:1 payoff. The classic 1.4 / 0.8 grid realizes
// 0.375:1. Both need an absurd win rate to break even.
//
// Everything below solves the take-profit from the fee-loaded loss so the NET
// reward:risk the account actually books equals MIN_REWARD_RISK. The sizing path
// (ai-trading-engine), the risk gate (risk-manager) and the exit engine
// (auto-take-profit) all import these helpers so winners and losers are measured
// on identical levels in paper and live.

export const ROUND_TRIP_FEE_PCT = 0.8; // 0.4% maker in + 0.4% maker out
export const MIN_REWARD_RISK = 1.6;    // minimum NET reward:risk on any scalp
export const TP_FLOOR_GROSS_PCT = 1.4; // absolute gross take-profit floor
// Hard cap on gross loss per trade. The 2.0% ceiling let the tuner widen the stop to
// 1.89% while the profit lock handed winners back at ~+1.4% gross — we risked more than
// we collected, so a 20% win rate bled the account. The cap is now 1.2%: the worst case
// is clearly smaller than a normal win, and the take-profit is always re-solved from the
// tuned stop so net R:R stays at MIN_REWARD_RISK at every stop width.
export const MAX_RISK_PCT = 1.2;
export const TUNED_STOP_MIN_PCT = 0.6; // tightest the tuner may go

// ── PROFIT LOCK (standard, non-wide entries) ─────────────────────────────────
// Arming at a fixed +1.6% gross snatched winners at roughly +0.8% net while losers ran
// the full stop, so the payoff was inverted by design. The lock now arms only once the
// gain is a real multiple of the risk the trade took (2.5× the stop distance) and gives
// back a proportional slice of that risk, so a protected winner always beats a stop-out.
export const PROFIT_LOCK_ARM_STOP_MULT = 2.5;      // arm at 2.5 × stop distance
export const PROFIT_LOCK_GIVEBACK_STOP_MULT = 0.6; // giveback = 0.6 × stop distance
/** Fallback arm level when the position's own stop distance is unknown. */
export const PROFIT_LOCK_ARM_PCT = MAX_RISK_PCT * PROFIT_LOCK_ARM_STOP_MULT;
export const PROFIT_LOCK_GIVEBACK_PCT = MAX_RISK_PCT * PROFIT_LOCK_GIVEBACK_STOP_MULT;

/** Profit-lock contract derived from the position's actual gross stop distance. */
export function solveProfitLock(grossStopPct?: number | null): { armPct: number; givebackPct: number } {
  const stop = Math.abs(Number(grossStopPct)) > 0 ? Math.abs(Number(grossStopPct)) : MAX_RISK_PCT;
  return {
    armPct: stop * PROFIT_LOCK_ARM_STOP_MULT,
    givebackPct: stop * PROFIT_LOCK_GIVEBACK_STOP_MULT,
  };
}

// ── ADAPTIVE (per-coin) GEOMETRY ─────────────────────────────────────────────
// A fixed 4.48% target is unreachable for a coin whose hourly range is 0.3%, while a
// fixed 1.5% stop is inside the noise of a coin whose hourly range is 1.2%. Both are
// now derived from the asset's own HOURLY ATR so the stop sits outside that coin's chop
// and the target is something that coin can actually travel inside the hold window.
export const ADAPTIVE_STOP_ATR_MULT = 1.4;   // stop = 1.4 × hourly ATR%, clamped to the tuned band
export const ADAPTIVE_MIN_HOLD_MINUTES = 360;   // 6h — give the target time to be reached
export const ADAPTIVE_MAX_HOLD_MINUTES = 1440;  // 24h
/** Fraction of the hold window's average range the target may demand. */
export const ADAPTIVE_REACH_FACTOR = 0.85;

export interface AdaptiveGeometry extends ExitGeometry {
  /** Hold window sized so the target is reachable by the coin's own range. */
  holdMinutes: number;
  /** False when this coin cannot travel to its target inside the hold window. */
  reachable: boolean;
  /** Hours of average hourly range the target demands. */
  hoursToTarget: number;
}

/**
 * Per-coin geometry: stop sized from the coin's hourly ATR inside the tuned band,
 * target re-solved from that stop so NET reward:risk still equals MIN_REWARD_RISK,
 * and a hold window long enough for the target to be reachable.
 */
export function solveAdaptiveGeometry(
  hourlyAtrPct?: number | null,
  tunedStopPct?: number | null,
): AdaptiveGeometry {
  const atr = Number(hourlyAtrPct) > 0 ? Number(hourlyAtrPct) : 0;
  const tuned = Math.abs(Number(tunedStopPct)) > 0 ? Math.abs(Number(tunedStopPct)) : MAX_RISK_PCT;
  const raw = atr > 0 ? atr * ADAPTIVE_STOP_ATR_MULT : tuned;
  const stopLossPct = Math.min(MAX_RISK_PCT, Math.max(TUNED_STOP_MIN_PCT, raw));
  const base = solveExitGeometry(0, stopLossPct);

  const hoursToTarget = atr > 0 ? base.takeProfitPct / atr : Infinity;
  const neededMinutes = Number.isFinite(hoursToTarget)
    ? Math.ceil((hoursToTarget / ADAPTIVE_REACH_FACTOR) * 60)
    : ADAPTIVE_MAX_HOLD_MINUTES;
  const holdMinutes = Math.min(
    ADAPTIVE_MAX_HOLD_MINUTES,
    Math.max(ADAPTIVE_MIN_HOLD_MINUTES, neededMinutes),
  );
  const reachable =
    atr > 0 && base.takeProfitPct <= atr * (holdMinutes / 60) * ADAPTIVE_REACH_FACTOR;

  return { ...base, holdMinutes, reachable, hoursToTarget };
}

export interface ExitGeometry {
  /** Gross take-profit distance from entry, in percent (fees not yet paid). */
  takeProfitPct: number;
  /** Gross stop distance from entry, in percent, always positive. */
  stopLossPct: number;
  /** What the winner actually banks after the round trip. */
  netWinPct: number;
  /** What the loser actually costs after the round trip. */
  netLossPct: number;
  /** netWinPct / netLossPct — the payoff the account books. */
  netRewardRisk: number;
  /** takeProfitPct / stopLossPct — the (misleading) pre-fee ratio. */
  grossRewardRisk: number;
  /** True when the requested pair had to be corrected. */
  adjusted: boolean;
}

/** Net reward:risk for an arbitrary gross TP/stop pair. */
export function netRewardRiskOf(grossTpPct: number, grossStopPct: number): number {
  const netLoss = Math.abs(grossStopPct) + ROUND_TRIP_FEE_PCT;
  if (netLoss <= 0) return 0;
  return (grossTpPct - ROUND_TRIP_FEE_PCT) / netLoss;
}

/** Gross take-profit required for a given gross stop to clear MIN_REWARD_RISK net. */
export function requiredGrossTakeProfit(
  grossStopPct: number,
  minRewardRisk: number = MIN_REWARD_RISK,
): number {
  const netLoss = Math.abs(grossStopPct) + ROUND_TRIP_FEE_PCT;
  return ROUND_TRIP_FEE_PCT + minRewardRisk * netLoss;
}

/**
 * Clamp any requested take-profit / stop pair into geometry that is profitable
 * NET of fees. The stop is capped (never widened), the target is raised.
 */
export function solveExitGeometry(rawTpPct: number, rawStopPct: number): ExitGeometry {
  const requestedStop = Math.abs(Number(rawStopPct)) > 0 ? Math.abs(Number(rawStopPct)) : MAX_RISK_PCT;
  const stopLossPct = Math.min(requestedStop, MAX_RISK_PCT);

  const requestedTp = Number(rawTpPct) > 0 ? Number(rawTpPct) : 0;
  const takeProfitPct = Math.max(
    requestedTp,
    TP_FLOOR_GROSS_PCT,
    requiredGrossTakeProfit(stopLossPct),
  );

  const netLossPct = stopLossPct + ROUND_TRIP_FEE_PCT;
  const netWinPct = takeProfitPct - ROUND_TRIP_FEE_PCT;

  return {
    takeProfitPct,
    stopLossPct,
    netWinPct,
    netLossPct,
    netRewardRisk: netWinPct / netLossPct,
    grossRewardRisk: takeProfitPct / stopLossPct,
    adjusted: takeProfitPct > requestedTp + 1e-9 || stopLossPct < requestedStop - 1e-9,
  };
}

/** Absolute price levels for a long entry, derived from the solved geometry. */
export function exitPricesForLong(entryPrice: number, geo: ExitGeometry) {
  return {
    stopLossPrice: entryPrice * (1 - geo.stopLossPct / 100),
    takeProfitPrice: entryPrice * (1 + geo.takeProfitPct / 100),
  };
}

export function describeGeometry(geo: ExitGeometry): string {
  return (
    `TP +${geo.takeProfitPct.toFixed(2)}% gross (net +${geo.netWinPct.toFixed(2)}%) | ` +
    `Stop -${geo.stopLossPct.toFixed(2)}% gross (net -${geo.netLossPct.toFixed(2)}%) | ` +
    `NET R:R ${geo.netRewardRisk.toFixed(2)}:1 (gross ${geo.grossRewardRisk.toFixed(2)}:1)`
  );
}

// ── WIDE-STOP SWING MODE (regime-conditional) ────────────────────────────────
// The locked 3.36%/0.80% geometry books a stop on ~68% of swings because 0.80% is
// inside one 15m ATR of noise. The walk-forward on 60 days of real Coinbase candles
// showed a wide target with a wider stop and a 48h hold is the only variant
// that turns positive — but ONLY while the aggregate tape is rising, so this mode is
// gated by the tape read and stands down otherwise.
// A 3.5% maximum stop costs 4.3% after the 0.8% round trip. A 7.68% gross target
// nets 6.88%, preserving the required 1.6:1 fee-adjusted reward:risk ratio.
export const WIDE_TP_GROSS_PCT = 7.68;     // gross take-profit
// STOP SIZING BASIS: the HOURLY ATR, not the 5-minute ATR. Every one of the 14 closed
// swings exited at exactly the 1.2% floor because 5m ATR (~0.4%) × 2.5 lands inside
// intraday noise while the target needs 48h to travel. Hourly ATR × 2.5 puts the stop
// outside ordinary chop while the 7.68% target preserves the fee-adjusted 1.6:1 ratio.
export const WIDE_STOP_ATR_MULT = 3.5;     // stop = 3.5 × hourly ATR% (clamped below) — 2.5× pinned every stop at the 2% floor
export const WIDE_STOP_MIN_PCT = 2.0;      // never tighter than swing noise
export const WIDE_STOP_MAX_PCT = 3.5;      // worst-case loss cap
export const WIDE_MAX_HOLD_MINUTES = 2880; // 48h


/** ATR-scaled wide geometry. Stop is clamped so net R:R still clears MIN_REWARD_RISK. */
export function solveWideGeometry(atrPct?: number | null): ExitGeometry {
  const atr = Number(atrPct) > 0 ? Number(atrPct) : WIDE_STOP_MIN_PCT / WIDE_STOP_ATR_MULT;
  const stopLossPct = Math.min(
    WIDE_STOP_MAX_PCT,
    Math.max(WIDE_STOP_MIN_PCT, atr * WIDE_STOP_ATR_MULT),
  );
  const takeProfitPct = WIDE_TP_GROSS_PCT;
  const netLossPct = stopLossPct + ROUND_TRIP_FEE_PCT;
  const netWinPct = takeProfitPct - ROUND_TRIP_FEE_PCT;
  return {
    takeProfitPct,
    stopLossPct,
    netWinPct,
    netLossPct,
    netRewardRisk: netWinPct / netLossPct,
    grossRewardRisk: takeProfitPct / stopLossPct,
    adjusted: false,
  };
}

// ── WIDE-MODE INTERMEDIATE EXITS — ALL DISABLED ──────────────────────────────
// The original wide contract (roomy ATR stop, 48h hold, target or stop only) booked
// better results than the layered trailing / breakeven / partial ladder that replaced it:
// the ladder clipped nearly every winner at +0.3-1.9% while the tightened 1.2% stop fired
// on ordinary noise, so losers stayed full size and winners never ran. Wide swings are
// back to running to the target or the stop, nothing in between.
export const WIDE_TRAILING_ENABLED = false;
export const WIDE_TRAIL_ARM_PCT = 2.6;  // gross gain at which trailing would arm
export const WIDE_TRAIL_DROP_PCT = 0.7; // gross giveback from peak that would exit

export const WIDE_BREAKEVEN_ENABLED = false;
export const WIDE_BREAKEVEN_ARM_PCT = 2.0;   // gross gain that would arm the lock
export const WIDE_BREAKEVEN_FLOOR_PCT = 1.6; // gross level the lock would exit at

export const WIDE_PARTIAL_TP_ENABLED = false;
export const WIDE_PARTIAL_TP_PCT = 2.5;   // gross gain at which the partial would fire
export const WIDE_PARTIAL_FRACTION = 0.5; // fraction of the position sold

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
export const MAX_RISK_PCT = 0.8;       // hard cap on gross loss per trade

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
export const WIDE_TP_GROSS_PCT = 4.0;      // gross take-profit
export const WIDE_STOP_ATR_MULT = 2.5;     // stop = 2.5 × ATR% (clamped to the band below)
export const WIDE_STOP_MIN_PCT = 1.2;      // never tighter than noise
export const WIDE_STOP_MAX_PCT = 1.2;      // keeps NET R:R ≥ 1.6:1 at a 4% target
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

// ── WIDE-MODE ARMED TRAILING STOP ────────────────────────────────────────────
// Arming at the target level (+4%) made trailing dead code: a trade that reached the
// arm level simply took profit, so the frequent +2-3% excursions round-tripped back to
// the stop. Trailing now arms well below the target and gives back a tight amount, so a
// stalled move books a real net winner while runners still ride to the full target.
export const WIDE_TRAIL_ARM_PCT = 2.6;  // gross gain at which trailing arms
export const WIDE_TRAIL_DROP_PCT = 0.7; // gross giveback from peak that exits

// ── WIDE-MODE BREAKEVEN LOCK ─────────────────────────────────────────────────
// Losers were booking the full net -2.0% (1.2% stop + 0.8% fees) while winners were
// being clipped at +0.4-1.2% net. Once a swing has shown a real move up, the stop
// ratchets to a level that still covers the round trip, so a round-tripped winner
// costs ~nothing instead of a full-size loss.
// Measured: a 0.9% floor armed at 1.4% fired inside ordinary noise and booked 18 exits
// averaging +0.26% net — winners were being cut for nothing. The lock now arms only after
// a move that clears the round trip twice over and exits at a level that banks real profit.
export const WIDE_BREAKEVEN_ARM_PCT = 2.0;   // gross gain that arms the lock
export const WIDE_BREAKEVEN_FLOOR_PCT = 1.6; // gross level the lock exits at (net ~+0.8%)

// ── WIDE-MODE PARTIAL TAKE-PROFIT ────────────────────────────────────────────
// Half the position is banked at an interim level; the remainder runs to the full
// target behind the armed trailing stop.
// DISABLED: halving every winner while every loser stayed full size produced a 0.45:1
// payoff on a 61% win rate — mathematically negative. Wide swings now run full size
// into the trailing/breakeven ladder so a winner is measured on the same notional as a loser.
export const WIDE_PARTIAL_TP_ENABLED = false;
export const WIDE_PARTIAL_TP_PCT = 2.5;   // gross gain at which the partial fires
export const WIDE_PARTIAL_FRACTION = 0.5; // fraction of the position sold

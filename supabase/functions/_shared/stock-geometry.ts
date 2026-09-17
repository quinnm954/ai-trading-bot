// ── STOCK EXIT GEOMETRY ──────────────────────────────────────────────────────
// Equities are NOT crypto and cannot reuse the crypto constants:
//
//   * A liquid large-cap moves ~1-2% in a whole day; the crypto 4-7% targets are
//     simply unreachable inside a session, so a stock target has to be small.
//   * Alpaca charges no commission, so the round-trip cost assumption drops from
//     0.8% to a spread/slippage allowance. That means a modest target still clears
//     costs — the crypto maths, which needed a big target just to pay the fees,
//     does not apply.
//   * Holds are session-bounded rather than 24-48h wall-clock windows.
//
// Same discipline as crypto though: the stop comes from the asset's own recent
// range, and the target is solved FROM that stop so net reward:risk is enforced.

import { roundTripCostPct } from './asset-class.ts';

const COST = roundTripCostPct('stocks'); // 0.06% — no commission, spread only

/** Minimum net reward:risk on any stock entry. */
export const STOCK_MIN_REWARD_RISK = 1.6;
/** Stop = multiple of the symbol's hourly ATR%, clamped to the band below. */
export const STOCK_STOP_ATR_MULT = 1.2;
export const STOCK_STOP_MIN_PCT = 0.4;  // tighter than crypto — equities are calmer
export const STOCK_STOP_MAX_PCT = 1.5;  // hard worst-case per trade
/** Absolute target floor so a trade is worth the spread at all. */
export const STOCK_TP_FLOOR_PCT = 0.7;
/** Holds are intraday-to-few-sessions, expressed in trading minutes. */
export const STOCK_MIN_HOLD_MINUTES = 60;
export const STOCK_MAX_HOLD_MINUTES = 390 * 3; // ~3 full sessions
/** Fraction of the available range the target may demand before it's unreachable. */
export const STOCK_REACH_FACTOR = 0.85;

export interface StockGeometry {
  takeProfitPct: number;
  stopLossPct: number;
  netWinPct: number;
  netLossPct: number;
  netRewardRisk: number;
  grossRewardRisk: number;
  holdMinutes: number;
  reachable: boolean;
  hoursToTarget: number;
  costPct: number;
}

export function requiredStockTakeProfit(
  grossStopPct: number,
  minRewardRisk = STOCK_MIN_REWARD_RISK,
): number {
  const netLoss = Math.abs(grossStopPct) + COST;
  return COST + minRewardRisk * netLoss;
}

/**
 * Per-symbol stock geometry from the symbol's hourly ATR%.
 * `tunedStopPct` lets the per-account tuner move the stop inside the band.
 * `instrument` shapes the band per instrument class (a 3× fund needs a wider
 * clamp and a shorter hold than a mega-cap; an index ETF needs a tighter one).
 */
export function solveStockGeometry(
  hourlyAtrPct?: number | null,
  tunedStopPct?: number | null,
  bounds?: { minStopPct?: number | null; maxStopPct?: number | null; atrMult?: number | null },
  instrument?: {
    atrMultScale?: number;
    minStopPct?: number;
    maxStopPct?: number;
    tpFloorPct?: number;
    holdScale?: number;
  } | null,
): StockGeometry {
  // Account bounds win when set; otherwise the instrument class supplies them.
  const classMin = Number(instrument?.minStopPct) > 0 ? Number(instrument!.minStopPct) : STOCK_STOP_MIN_PCT;
  const classMax = Number(instrument?.maxStopPct) > 0 ? Number(instrument!.maxStopPct) : STOCK_STOP_MAX_PCT;
  const classScale = Number(instrument?.atrMultScale) > 0 ? Number(instrument!.atrMultScale) : 1;
  const classTpFloor = Number(instrument?.tpFloorPct) > 0 ? Number(instrument!.tpFloorPct) : STOCK_TP_FLOOR_PCT;
  const holdScale = Number(instrument?.holdScale) > 0 ? Number(instrument!.holdScale) : 1;

  const minStop = clamp(Number(bounds?.minStopPct) || classMin, 0.2, 2.0);
  const maxStop = clamp(Number(bounds?.maxStopPct) || classMax, minStop, 4.0);
  const atrMult = clamp((Number(bounds?.atrMult) || STOCK_STOP_ATR_MULT) * classScale, 0.4, 3.0);

  const atr = Number(hourlyAtrPct) > 0 ? Number(hourlyAtrPct) : 0;
  const tuned = Math.abs(Number(tunedStopPct)) > 0 ? Math.abs(Number(tunedStopPct)) : maxStop;
  const raw = atr > 0 ? atr * atrMult : tuned;
  const stopLossPct = clamp(raw, minStop, maxStop);

  const takeProfitPct = Math.max(classTpFloor, requiredStockTakeProfit(stopLossPct));

  const netLossPct = stopLossPct + COST;
  const netWinPct = takeProfitPct - COST;

  const maxHold = Math.max(STOCK_MIN_HOLD_MINUTES, Math.round(STOCK_MAX_HOLD_MINUTES * holdScale));
  const hoursToTarget = atr > 0 ? takeProfitPct / atr : Infinity;
  const neededMinutes = Number.isFinite(hoursToTarget)
    ? Math.ceil((hoursToTarget / STOCK_REACH_FACTOR) * 60)
    : maxHold;
  const holdMinutes = clamp(neededMinutes, STOCK_MIN_HOLD_MINUTES, maxHold);
  const reachable = atr > 0 && takeProfitPct <= atr * (holdMinutes / 60) * STOCK_REACH_FACTOR;


  return {
    takeProfitPct,
    stopLossPct,
    netWinPct,
    netLossPct,
    netRewardRisk: netWinPct / netLossPct,
    grossRewardRisk: takeProfitPct / stopLossPct,
    holdMinutes,
    reachable,
    hoursToTarget,
    costPct: COST,
  };
}

export function stockExitPricesForLong(entryPrice: number, geo: StockGeometry) {
  return {
    stopLossPrice: entryPrice * (1 - geo.stopLossPct / 100),
    takeProfitPrice: entryPrice * (1 + geo.takeProfitPct / 100),
  };
}

export function describeStockGeometry(geo: StockGeometry): string {
  return (
    `TP +${geo.takeProfitPct.toFixed(2)}% (net +${geo.netWinPct.toFixed(2)}%) | ` +
    `Stop -${geo.stopLossPct.toFixed(2)}% (net -${geo.netLossPct.toFixed(2)}%) | ` +
    `NET R:R ${geo.netRewardRisk.toFixed(2)}:1 | hold ≤${Math.round(geo.holdMinutes / 60)}h | ` +
    `commission-free (${geo.costPct}% spread allowance)`
  );
}

// ── INTRADAY MARGIN GUARDRAILS (replaces PDT counting) ───────────────────────
// FINRA removed the pattern-day-trader designation and the $25,000 minimum
// equity rule on 2026-06-04, replacing them with a risk-based intraday margin
// standard. Day trades are no longer counted or restricted. What still binds:
//   * $2,000 minimum equity to trade on margin at all
//   * 25% maintenance margin
//   * brokers may block trades that create an intraday margin deficit
// So instead of counting day trades we cap intraday exposure ourselves.

export const MARGIN_MIN_EQUITY_USD = 2000;
export const MAINTENANCE_MARGIN_PCT = 25;

export interface IntradayCheck {
  allowed: boolean;
  reason: string;
  exposurePct: number;
  ceilingPct: number;
}

export function checkIntradayExposure(opts: {
  equity: number;
  openExposureUsd: number;
  newPositionUsd: number;
  ceilingPct: number;
  cashAccount: boolean;
  cashAvailable?: number;
}): IntradayCheck {
  const ceilingPct = clamp(Number(opts.ceilingPct) || 50, 5, 100);
  const equity = Number(opts.equity) || 0;
  const projected = Math.max(0, Number(opts.openExposureUsd) || 0) + Math.max(0, Number(opts.newPositionUsd) || 0);
  const exposurePct = equity > 0 ? (projected / equity) * 100 : 0;

  if (equity <= 0) {
    return { allowed: false, reason: 'no equity in the stock account', exposurePct, ceilingPct };
  }

  // Cash accounts never touch margin: exposure simply cannot exceed settled cash.
  if (opts.cashAccount) {
    const cash = Number(opts.cashAvailable ?? equity);
    if (opts.newPositionUsd > cash) {
      return {
        allowed: false,
        reason: `cash account: $${opts.newPositionUsd.toFixed(0)} exceeds available cash $${cash.toFixed(0)}`,
        exposurePct,
        ceilingPct,
      };
    }
  } else if (equity < MARGIN_MIN_EQUITY_USD) {
    return {
      allowed: false,
      reason: `margin trading requires $${MARGIN_MIN_EQUITY_USD} equity (account has $${equity.toFixed(0)})`,
      exposurePct,
      ceilingPct,
    };
  }

  if (exposurePct > ceilingPct) {
    return {
      allowed: false,
      reason: `intraday exposure ${exposurePct.toFixed(0)}% would exceed the ${ceilingPct}% ceiling`,
      exposurePct,
      ceilingPct,
    };
  }

  return {
    allowed: true,
    reason: `intraday exposure ${exposurePct.toFixed(0)}% of ${ceilingPct}% ceiling`,
    exposurePct,
    ceilingPct,
  };
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

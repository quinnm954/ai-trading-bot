/**
 * Penny Stock Signal Scoring Engine
 *
 * 0–100 weighted score for under-$1 stocks. Mirrors the structure of
 * `signalScoring.ts` but uses penny-stock-specific factors (relative volume,
 * news catalyst, spread, float, liquidity).
 */

export interface PennyStockInputs {
  price: number;
  changePercent: number;
  volume: number;
  relativeVolume: number;        // current vol / avg vol
  floatShares: number;
  spreadPercent: number;          // (ask-bid)/mid * 100
  vwap: number;
  ema9: number;
  ema21: number;
  resistance: number;             // recent swing high
  support: number;                // recent swing low
  hasCatalyst: boolean;
  stopLoss?: number | null;
  takeProfit?: number | null;
}

export interface PennyFactorScores {
  relativeVolume: number;
  catalyst: number;
  breakout: number;
  vwapReclaim: number;
  emaTrend: number;
  momentum: number;
  float: number;
  spread: number;
  liquidity: number;
}

export interface PennyScore {
  factors: PennyFactorScores;
  total: number;        // 0..100
  riskReward: number;
  valid: boolean;
  reasons: string[];
}

export const PENNY_WEIGHTS: Record<keyof PennyFactorScores, number> = {
  relativeVolume: 16,
  catalyst: 14,
  breakout: 14,
  vwapReclaim: 10,
  emaTrend: 10,
  momentum: 10,
  float: 8,
  spread: 10,
  liquidity: 8,
};

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export function scorePennyStock(i: PennyStockInputs): PennyScore {
  const reasons: string[] = [];

  // Relative volume: 1x = 0, 3x+ = 1
  const relativeVolume = clamp((i.relativeVolume - 1) / 2);
  if (i.relativeVolume >= 3) reasons.push(`Strong rel-vol ${i.relativeVolume.toFixed(1)}x`);

  const catalyst = i.hasCatalyst ? 1 : 0.15;
  if (i.hasCatalyst) reasons.push('News catalyst present');
  else reasons.push('No news catalyst');

  // Breakout above resistance
  const breakout = i.price > i.resistance
    ? clamp(0.7 + ((i.price - i.resistance) / i.resistance) * 20)
    : i.price >= i.resistance * 0.98 ? 0.5 : 0.2;

  // VWAP reclaim (price > VWAP)
  const vwapReclaim = i.price > i.vwap ? 1 : i.price >= i.vwap * 0.995 ? 0.5 : 0.2;

  // EMA trend (9 > 21)
  const emaTrend = i.ema9 > i.ema21 ? 1 : i.ema9 >= i.ema21 * 0.995 ? 0.5 : 0.2;

  // Momentum from change %
  const momentum = clamp(i.changePercent / 15);

  // Float: 1M–20M sweet spot; penalise huge floats (>100M) and microscopic (<500k)
  let floatScore: number;
  if (i.floatShares < 500_000) floatScore = 0.2;
  else if (i.floatShares <= 20_000_000) floatScore = 1;
  else if (i.floatShares <= 100_000_000) floatScore = 0.6;
  else floatScore = 0.3;

  // Spread: <1% great, >3% bad
  const spread = i.spreadPercent < 0.5 ? 1
    : i.spreadPercent < 1 ? 0.85
    : i.spreadPercent < 2 ? 0.6
    : i.spreadPercent < 3 ? 0.35
    : 0.1;
  if (i.spreadPercent >= 2) reasons.push(`Wide spread ${i.spreadPercent.toFixed(2)}%`);

  // Liquidity: dollar volume
  const dollarVol = i.volume * i.price;
  const liquidity = dollarVol >= 5_000_000 ? 1
    : dollarVol >= 1_000_000 ? 0.7
    : dollarVol >= 250_000 ? 0.4
    : 0.15;

  const factors: PennyFactorScores = {
    relativeVolume, catalyst, breakout, vwapReclaim,
    emaTrend, momentum, float: floatScore, spread, liquidity,
  };

  let total = 0;
  (Object.keys(factors) as Array<keyof PennyFactorScores>).forEach(k => {
    total += factors[k] * PENNY_WEIGHTS[k];
  });
  total = Math.round(total);

  // Risk / reward
  let rr = 0;
  if (i.stopLoss && i.takeProfit) {
    const risk = Math.abs(i.price - i.stopLoss);
    const reward = Math.abs(i.takeProfit - i.price);
    rr = risk > 0 ? reward / risk : 0;
  }

  const valid = total >= 80
    && rr >= 2
    && !!i.stopLoss
    && i.spreadPercent <= 2
    && i.relativeVolume >= 2
    && liquidity >= 0.4;

  if (!i.stopLoss) reasons.push('Rejected: no stop loss set');
  if (rr < 2 && i.stopLoss) reasons.push(`Rejected: R/R ${rr.toFixed(2)} < 2.0`);
  if (total < 80) reasons.push(`Score ${total} below 80 threshold`);

  return { factors, total, riskReward: rr, valid, reasons };
}

export function detectPennyWarnings(s: {
  volume: number;
  spreadPercent: number;
  exchange: string;
  changePercent: number;
  hasCatalyst: boolean;
  floatShares: number;
  recentReverseSplit?: boolean;
  recentOfferings?: number;
}): string[] {
  const w: string[] = [];
  if (s.volume < 200_000) w.push('Very low volume');
  if (s.spreadPercent > 3) w.push('Huge bid/ask spread');
  if (s.recentReverseSplit) w.push('Recent reverse split');
  if ((s.recentOfferings ?? 0) >= 2) w.push('Repeated offering history');
  if (s.floatShares > 200_000_000) w.push('Heavy dilution risk');
  if (s.exchange === 'OTC') w.push('OTC-only stock');
  if (s.changePercent > 50) w.push('Pump-and-dump style spike');
  if (!s.hasCatalyst) w.push('No news catalyst');
  return w;
}

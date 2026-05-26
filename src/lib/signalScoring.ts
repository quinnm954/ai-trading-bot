/**
 * Signal Scoring Engine — single source of truth for paper, live, and backtest.
 *
 * Produces a 0–100 weighted score from technical indicators and a `valid` gate
 * that requires score >= 75 AND risk/reward >= 1.5 AND a stop loss.
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SignalInputs {
  candles: Candle[];
  entry: number;
  stopLoss: number | null;
  takeProfit: number | null;
  side: 'buy' | 'sell';
}

export interface FactorScores {
  trend: number;            // 0..1
  emaAlignment: number;     // 0..1
  rsi: number;              // 0..1
  macd: number;             // 0..1
  vwap: number;             // 0..1
  volume: number;           // 0..1
  supportResistance: number;// 0..1
  volatility: number;       // 0..1
  riskReward: number;       // 0..1
}

export interface SignalScore {
  factors: FactorScores;
  weighted: Record<keyof FactorScores, number>;
  total: number;            // 0..100
  riskReward: number;
  valid: boolean;
  reasons: string[];
}

export const WEIGHTS: Record<keyof FactorScores, number> = {
  trend: 18,
  emaAlignment: 14,
  rsi: 12,
  macd: 10,
  vwap: 10,
  volume: 12,
  supportResistance: 8,
  volatility: 8,
  riskReward: 8,
};

// ---------- Indicators ----------
export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function macd(values: number[]) {
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  const line = e12.map((v, i) => v - e26[i]);
  const signal = ema(line, 9);
  const hist = line[line.length - 1] - signal[signal.length - 1];
  return { line: line[line.length - 1], signal: signal[signal.length - 1], hist };
}

export function vwap(candles: Candle[]): number {
  let pv = 0, v = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    pv += tp * c.volume;
    v += c.volume;
  }
  return v > 0 ? pv / v : candles[candles.length - 1]?.close ?? 0;
}

export function atr(candles: Candle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i], p = candles[i - 1];
    trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ---------- Scorer ----------
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

export function scoreSignal(inputs: SignalInputs): SignalScore {
  const { candles, entry, stopLoss, takeProfit, side } = inputs;
  const closes = candles.map((c) => c.close);
  const last = closes[closes.length - 1] ?? entry;
  const reasons: string[] = [];

  // EMAs
  const e9 = ema(closes, 9)[9).length - 1];
  const e21 = ema(closes, 21)[21).length - 1];
  const e50 = ema(closes, 50)[50).length - 1];
  const trendUp = e9 > e21 && e21 > e50;
  const trendDown = e9 < e21 && e21 < e50;
  const dirOk = side === 'buy' ? trendUp : trendDown;
  const trend = dirOk ? 1 : (e9 > e21 ? (side === 'buy' ? 0.6 : 0.2) : (side === 'sell' ? 0.6 : 0.2));
  if (dirOk) reasons.push(`Trend aligned with ${side} (EMA9/21/50)`);

  // EMA alignment quality (spread)
  const spread = Math.abs(e9 - e50) / e50;
  const emaAlignment = clamp(spread * 50);

  // RSI
  const r = rsi(closes);
  const rsiScore = side === 'buy'
    ? (r < 30 ? 1 : r < 50 ? 0.8 : r < 70 ? 0.5 : 0.2)
    : (r > 70 ? 1 : r > 50 ? 0.8 : r > 30 ? 0.5 : 0.2);
  if (rsiScore >= 0.8) reasons.push(`RSI ${r.toFixed(1)} favors ${side}`);

  // MACD
  const m = macd(closes);
  const macdScore = side === 'buy'
    ? (m.hist > 0 && m.line > m.signal ? 1 : m.hist > 0 ? 0.6 : 0.2)
    : (m.hist < 0 && m.line < m.signal ? 1 : m.hist < 0 ? 0.6 : 0.2);

  // VWAP
  const vw = vwap(candles);
  const vwapScore = side === 'buy'
    ? (last > vw ? 1 : 0.3)
    : (last < vw ? 1 : 0.3);

  // Volume spike
  const recentVol = candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20;
  const lastVol = candles[candles.length - 1]?.volume ?? 0;
  const volRatio = recentVol > 0 ? lastVol / recentVol : 1;
  const volume = clamp((volRatio - 1) / 1.5);
  if (volume > 0.6) reasons.push(`Volume spike ${volRatio.toFixed(2)}x avg`);

  // Support / Resistance
  const recent = candles.slice(-50);
  const hi = Math.max(...recent.map((c) => c.high));
  const lo = Math.min(...recent.map((c) => c.low));
  const range = hi - lo;
  const fromLow = range > 0 ? (last - lo) / range : 0.5;
  const sr = side === 'buy'
    ? clamp(1 - fromLow + 0.2) // closer to support is better for longs
    : clamp(fromLow + 0.2);

  // Volatility (ATR vs price)
  const a = atr(candles);
  const atrPct = last > 0 ? (a / last) * 100 : 0;
  // Sweet spot 0.3% - 2%; too low (illiquid) or too high (chaotic) penalised
  const volatility = atrPct < 0.2 ? 0.3 : atrPct > 4 ? 0.2 : clamp(1 - Math.abs(atrPct - 1) / 2);
  if (atrPct > 4) reasons.push(`Extreme volatility (ATR ${atrPct.toFixed(2)}%) — caution`);

  // Risk / Reward
  let rr = 0;
  if (stopLoss && takeProfit) {
    const risk = Math.abs(entry - stopLoss);
    const reward = Math.abs(takeProfit - entry);
    rr = risk > 0 ? reward / risk : 0;
  }
  const riskReward = clamp((rr - 1) / 2); // 1.0 -> 0, 3.0 -> 1.0

  const factors: FactorScores = {
    trend,
    emaAlignment,
    rsi: rsiScore,
    macd: macdScore,
    vwap: vwapScore,
    volume,
    supportResistance: sr,
    volatility,
    riskReward,
  };

  const weighted = {} as Record<keyof FactorScores, number>;
  let total = 0;
  (Object.keys(factors) as Array<keyof FactorScores>).forEach((k) => {
    weighted[k] = factors[k] * WEIGHTS[k];
    total += weighted[k];
  });
  total = Math.round(total);

  const valid = total >= 75 && rr >= 1.5 && !!stopLoss;
  if (!stopLoss) reasons.push('Rejected: no stop loss set');
  if (rr < 1.5 && stopLoss) reasons.push(`Rejected: R/R ${rr.toFixed(2)} < 1.5`);
  if (total < 75) reasons.push(`Score ${total} below 75 threshold`);

  return { factors, weighted, total, riskReward: rr, valid, reasons };
}

export function riskLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 85) return 'low';
  if (score >= 70) return 'medium';
  return 'high';
}

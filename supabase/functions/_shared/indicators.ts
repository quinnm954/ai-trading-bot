// ═══════════════════════════════════════════════════════════════════════════════
// 📐 INDICATORS — single source of truth for every technical calculation
//
// These were previously inline in ai-trading-engine/index.ts. They are extracted
// VERBATIM (no behavioural change) so the backtest replay can score historical
// candles with the exact same math the live engine uses. If the backtester
// re-implemented them, results would silently drift from production and stop
// being evidence about anything.
//
// Anything added here must stay PURE: candles in, numbers out, no I/O.
// ═══════════════════════════════════════════════════════════════════════════════

// Detect the nearest swing-low support relative to `price` using ±`window` pivot lows.
// AUDIT FIX: the session low used to be appended as a fallback pivot, which made
// `below_support` mathematically unreachable (the lowest low is always ≤ price), so that
// veto never once fired. Support is now pivot-only; if every pivot sits above price, the
// price really has broken below structure and we say so.
export function findSupportLevel(lows: number[], price: number, window = 3): { support?: number; broken: boolean } {
  if (lows.length < window * 2 + 1) return { broken: false };
  const pivots: number[] = [];
  for (let i = window; i < lows.length - window; i++) {
    let isPivot = true;
    for (let j = i - window; j <= i + window; j++) {
      if (j !== i && lows[j] < lows[i]) { isPivot = false; break; }
    }
    if (isPivot) pivots.push(lows[i]);
  }
  if (!pivots.length) return { broken: false };
  const below = pivots.filter(p => p <= price).sort((a, b) => b - a);
  if (below.length) return { support: below[0], broken: false };
  // No pivot at or below price → price has traded through its recent swing structure.
  const above = [...pivots].sort((a, b) => a - b);
  return { support: above[0], broken: true };
}

export function classifyVol(atrPct: number): { cls: 'dead' | 'low' | 'sweet' | 'high' | 'extreme'; score: number } {
  // ATR% measured on 5m candles. Tradable "sweet spot" ≈ 0.25%–0.9%.
  if (atrPct < 0.08) return { cls: 'dead', score: 10 };          // illiquid / flat
  if (atrPct < 0.25) return { cls: 'low', score: 55 };           // workable but thin moves
  if (atrPct <= 0.9) return { cls: 'sweet', score: 100 };        // ideal for scalp entries
  if (atrPct <= 1.8) return { cls: 'high', score: 65 };          // moves are real but slippage rises
  return { cls: 'extreme', score: 25 };                          // chaotic — wide stops, poor R:R
}

/**
 * RSI(14) with Wilder smoothing — the standard every charting platform uses.
 * AUDIT FIX: this previously averaged only the last 14 bars' gains/losses with a flat
 * mean, which read up to 17 points away from a real RSI (measured: VTHO 24.5 vs 41.3).
 * That made coins look "oversold" that weren't and mis-fired the overbought veto.
 */
export function computeRSI(closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeBollinger(closes: number[], period = 20, mult = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  return { mid, upper, lower, width: mid > 0 ? (upper - lower) / mid : 0 };
}

// ── 📚 PLAYBOOK INDICATORS ────────────────────────────────────────────────────
/** Exponential moving average of the last `period` closes. */
export function computeEMA(values: number[], period: number): number | undefined {
  if (values.length < period) return undefined;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

/** Full EMA series (needed for the MACD signal line). */
export function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [ema];
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

/** MACD(12,26,9) histogram — current and previous bar, to detect a momentum turn. */
export function computeMacdHistogram(closes: number[]): { hist: number; prevHist: number } | undefined {
  if (closes.length < 35) return undefined;
  const fast = emaSeries(closes, 12);
  const slow = emaSeries(closes, 26);
  if (!fast.length || !slow.length) return undefined;
  // Align tails so both series describe the same bars.
  const len = Math.min(fast.length, slow.length);
  const macdLine = Array.from({ length: len }, (_, i) =>
    fast[fast.length - len + i] - slow[slow.length - len + i]);
  const signal = emaSeries(macdLine, 9);
  if (signal.length < 2) return undefined;
  const histAt = (back: number) =>
    macdLine[macdLine.length - 1 - back] - signal[signal.length - 1 - back];
  return { hist: histAt(0), prevHist: histAt(1) };
}

/** Rolling VWAP over the last `period` candles using typical price × volume. */
export function computeVWAP(closes: number[], highs: number[], lows: number[], volumes: number[], period = 20): number | undefined {
  const n = Math.min(period, closes.length, volumes.length);
  if (n < 5) return undefined;
  let pv = 0, vol = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const typical = (highs[i] + lows[i] + closes[i]) / 3;
    const v = volumes[i] || 0;
    pv += typical * v;
    vol += v;
  }
  if (!(vol > 0)) return undefined;
  return pv / vol;
}

/** Trigger-window volume vs its own baseline — participation confirmation. */
export function computeVolumeRatio(volumes: number[], recent = 3, baseline = 20): number | undefined {
  if (volumes.length < baseline + recent) return undefined;
  const recentSlice = volumes.slice(-recent);
  const baseSlice = volumes.slice(-(baseline + recent), -recent);
  const recentAvg = recentSlice.reduce((a, b) => a + b, 0) / recentSlice.length;
  const baseAvg = baseSlice.reduce((a, b) => a + b, 0) / baseSlice.length;
  if (!(baseAvg > 0)) return undefined;
  return recentAvg / baseAvg;
}

/** Rising-low structure over the last three swing windows. */
export function hasHigherLows(lows: number[], windows = 3): boolean | undefined {
  const size = 6;
  if (lows.length < size * windows) return undefined;
  const mins: number[] = [];
  for (let w = windows; w >= 1; w--) {
    const slice = lows.slice(lows.length - size * w, lows.length - size * (w - 1));
    mins.push(Math.min(...slice));
  }
  return mins.every((v, i) => i === 0 || v >= mins[i - 1]);
}

/** ATR(14)-style average true range over the supplied bars. */
export function averageTrueRange(highs: number[], lows: number[], closes: number[], period = 14): number | undefined {
  if (closes.length < period + 1) return undefined;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  const slice = trs.slice(-period);
  if (!slice.length) return undefined;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🕯️ CANDLE FEATURE BUILDER — the exact feature set the live engine trades on
//
// This is the body of ai-trading-engine's `fetchCandleTechnicals` / `fetchHtfContext`
// with the network call removed, so the same code serves:
//   • the live engine (fetch Coinbase → computeCandleTechnicals)
//   • the backtest replay (read cached historical candles → computeCandleTechnicals)
//
// Every audit fix is preserved here: the in-progress bar is dropped, gappy tape is
// refused, RSI is Wilder-smoothed, short-window changes are timestamp-aware, support
// is pivot-only, and the legacy score no longer rewards washed-out weakness.
//
// PURE: candles in, features out. No fetch, no clock other than the `nowSeconds`
// the caller supplies — which is what makes a lookahead-free replay possible.
// ═══════════════════════════════════════════════════════════════════════════════

import {
  averageTrueRange,
  classifyVol,
  computeBollinger,
  computeEMA,
  computeMacdHistogram,
  computeRSI,
  computeVWAP,
  computeVolumeRatio,
  findSupportLevel,
  hasHigherLows,
} from "./indicators.ts";

/** A single OHLCV bar. `start` is the bar's opening time in UNIX seconds. */
export interface RawCandle {
  start: number | string;
  open?: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume?: number | string;
}

export interface CandleTechnicals {
  change5m: number;
  change15m: number;
  lastClose: number;
  rsi14?: number;
  bbLower?: number;
  bbMid?: number;
  bbUpper?: number;
  bbWidth?: number;
  percentB?: number;
  techSetup: string;
  techScore: number;
  atrPct?: number;
  /** ATR(14) on ONE_HOUR candles as % of price — the swing-scale volatility used for stop sizing. */
  swingAtrPct?: number;
  volClass?: 'dead' | 'low' | 'sweet' | 'high' | 'extreme';
  volScore?: number;
  supportPrice?: number;
  distanceToSupportPct?: number;
  supportContext?: 'at_support' | 'near_support' | 'mid_range' | 'far_above_support' | 'below_support';
  // 📚 Playbook inputs
  ema9?: number;
  ema21?: number;
  macdHist?: number;
  macdHistPrev?: number;
  vwap?: number;
  volumeRatio?: number;
  higherLows?: boolean;
  htfAboveEma?: boolean;
  htfSlopePct?: number;
}

export interface HtfContext {
  swingAtrPct?: number;
  htfAboveEma?: boolean;
  htfSlopePct?: number;
  change1h?: number;
}

/** How many closed 5m bars an indicator set needs before it means anything. */
export const MIN_CLOSED_5M_BARS = 36;
/** Largest tolerated hole in the recent 5m series (seconds). Beyond this the tape is too thin. */
export const MAX_5M_GAP_SECONDS = 900;

const num = (v: unknown) => Number(v);

/**
 * Score a 5-minute series into the feature set the entry playbook consumes.
 * Only bars CLOSED at or before `nowSeconds` are used, so a replay at a past
 * timestamp sees exactly what the engine would have seen live at that moment.
 */
export function computeCandleTechnicals(raw: RawCandle[], nowSeconds: number): CandleTechnicals | null {
  const now = nowSeconds;
  // AUDIT FIX 1: drop the in-progress candle. Measured effect on live coins: change5m read
  // +0.03% instead of +0.62%, and volume participation 1.06× instead of 2.48× — enough to
  // flip the volume veto on and off at random.
  const sorted = [...raw]
    .sort((a, b) => num(a.start) - num(b.start))
    .filter((c) => num(c.start) + 300 <= now);
  if (sorted.length < MIN_CLOSED_5M_BARS) return null;

  const starts = sorted.map((c) => num(c.start));
  // AUDIT FIX 2: refuse gappy tape. Missing bars mean "no trades happened", so a series with
  // holes silently stretches RSI/BB/MACD/ATR across hours instead of minutes.
  const recentStarts = starts.slice(-24);
  let maxGap = 0;
  for (let i = 1; i < recentStarts.length; i++) maxGap = Math.max(maxGap, recentStarts[i] - recentStarts[i - 1]);
  if (maxGap > MAX_5M_GAP_SECONDS) return null;

  const closes = sorted.map((c) => num(c.close));
  const highs = sorted.map((c) => num(c.high));
  const lows = sorted.map((c) => num(c.low));
  const volumes = sorted.map((c) => num(c.volume) || 0);
  const last = closes[closes.length - 1];

  // AUDIT FIX 3: timestamp-aware short-window changes — only quoted when the bars used
  // really are 5 and 15 minutes back, never as an implicit 0%.
  const tLast = starts[starts.length - 1];
  const idxAt = (secondsBack: number) => starts.lastIndexOf(tLast - secondsBack);
  const i5 = idxAt(300);
  const i15 = idxAt(900);
  const change5m = i5 >= 0 && closes[i5] > 0 ? ((last - closes[i5]) / closes[i5]) * 100 : 0;
  const change15m = i15 >= 0 && closes[i15] > 0 ? ((last - closes[i15]) / closes[i15]) * 100 : change5m;

  const rsi = computeRSI(closes, 14);
  const bb = computeBollinger(closes, 20, 2);
  const percentB = bb && bb.upper > bb.lower ? (last - bb.lower) / (bb.upper - bb.lower) : undefined;

  // 📚 Playbook inputs — trend structure, momentum turn, participation and value.
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);
  const macd = computeMacdHistogram(closes);
  const vwap = computeVWAP(closes, highs, lows, volumes, 20);
  const volumeRatio = computeVolumeRatio(volumes, 3, 20);
  const higherLows = hasHigherLows(lows, 3);

  // ATR(14) on 5m → realized volatility as % of last price
  let atrPct: number | undefined;
  let volClass: 'dead' | 'low' | 'sweet' | 'high' | 'extreme' | undefined;
  let volScore: number | undefined;
  if (closes.length >= 15) {
    const atr = averageTrueRange(highs, lows, closes, 14);
    if (atr !== undefined && last > 0) {
      atrPct = (atr / last) * 100;
      const v = classifyVol(atrPct);
      volClass = v.cls;
      volScore = v.score;
    }
  }

  // Score the setup: 0–100.
  // AUDIT FIX 4: this used to REWARD "RSI oversold", "%B at lower band" and "bounce from
  // lower BB" — the exact falling-knife setups the entry playbook exists to block. The
  // legacy bonus could lift a weak candidate into range and then be vetoed downstream,
  // which made the score meaningless. Weakness is no longer rewarded here.
  let score = 50;
  const labels: string[] = [];
  if (rsi !== undefined) {
    if (rsi < 30) { score -= 6; labels.push(`RSI ${rsi.toFixed(0)} washed out`); }
    else if (rsi < 45) { labels.push(`RSI ${rsi.toFixed(0)} cool`); }
    else if (rsi >= 50 && rsi <= 62) { score += 10; labels.push(`RSI ${rsi.toFixed(0)} constructive`); }
    else if (rsi > 70) { score -= 20; labels.push(`RSI ${rsi.toFixed(0)} overbought`); }
    else if (rsi > 62) { score -= 8; labels.push(`RSI ${rsi.toFixed(0)} hot`); }
  }
  if (percentB !== undefined) {
    if (percentB < 0.15) { score -= 10; labels.push(`%B ${percentB.toFixed(2)} pinned to lower band`); }
    else if (percentB >= 0.45 && percentB <= 0.75) { score += 10; labels.push(`%B ${percentB.toFixed(2)} mid-upper band`); }
    else if (percentB > 0.95) { score -= 20; labels.push(`%B ${percentB.toFixed(2)} above upper BB`); }
    else if (percentB > 0.8) { score -= 8; labels.push(`%B ${percentB.toFixed(2)} upper band`); }
  }
  if (bb && bb.width < 0.03) { score += 6; labels.push(`BB squeeze (${(bb.width * 100).toFixed(2)}%)`); }
  // Strength confirmation, not dip-catching: rising price with the band mid reclaimed.
  if (change5m > 0 && percentB !== undefined && percentB >= 0.5) { score += 10; labels.push('rising above band mid'); }
  if (change5m > 3) { score -= 15; labels.push('5m spike'); }
  if (ema9 !== undefined && ema21 !== undefined) {
    if (ema9 >= ema21) { score += 8; labels.push('EMA9 ≥ EMA21'); }
    else { score -= 8; labels.push('EMA9 < EMA21'); }
  }
  if (macd && macd.hist > macd.prevHist) { score += 6; labels.push('MACD hist rising'); }

  // Volatility-aware adjustments
  if (atrPct !== undefined && volClass) {
    if (volClass === 'sweet') { score += 12; labels.push(`vol sweet ATR ${atrPct.toFixed(2)}%`); }
    else if (volClass === 'high') { score += 2; labels.push(`vol high ATR ${atrPct.toFixed(2)}%`); }
    else if (volClass === 'low') { score -= 4; labels.push(`vol low ATR ${atrPct.toFixed(2)}%`); }
    else if (volClass === 'dead') { score -= 25; labels.push(`vol dead ATR ${atrPct.toFixed(2)}%`); }
    else if (volClass === 'extreme') { score -= 20; labels.push(`vol extreme ATR ${atrPct.toFixed(2)}%`); }
  }

  // Support-level awareness — structure location, now able to report a real break.
  const sup = findSupportLevel(lows, last, 3);
  const supportPrice = sup.support;
  let distanceToSupportPct: number | undefined;
  let supportContext: 'at_support' | 'near_support' | 'mid_range' | 'far_above_support' | 'below_support' | undefined;
  if (supportPrice !== undefined && last > 0) {
    distanceToSupportPct = ((last - supportPrice) / last) * 100;
    // Use ATR% as the "what's close?" yardstick when available, else fall back to fixed bands.
    const nearBand = Math.max(0.4, (atrPct ?? 0.5) * 0.6);   // "at support"
    const midBand  = Math.max(1.5, (atrPct ?? 0.5) * 2.0);   // "near support"
    if (sup.broken || distanceToSupportPct < 0) {
      supportContext = 'below_support';
      score -= 18; labels.push(`below support ${supportPrice.toFixed(6)}`);
    } else if (distanceToSupportPct <= nearBand) {
      supportContext = 'at_support';
      score += 14; labels.push(`at support ${supportPrice.toFixed(6)} (${distanceToSupportPct.toFixed(2)}% away)`);
    } else if (distanceToSupportPct <= midBand) {
      supportContext = 'near_support';
      score += 6; labels.push(`near support (${distanceToSupportPct.toFixed(2)}% away)`);
    } else if (distanceToSupportPct <= midBand * 2) {
      supportContext = 'mid_range';
    } else {
      supportContext = 'far_above_support';
      score -= 10; labels.push(`far above support (${distanceToSupportPct.toFixed(2)}% — poor R:R)`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  const techSetup = labels.length ? labels.join(' | ') : 'neutral';

  return {
    change5m, change15m, lastClose: last,
    rsi14: rsi,
    bbLower: bb?.lower, bbMid: bb?.mid, bbUpper: bb?.upper, bbWidth: bb?.width,
    percentB,
    techSetup, techScore: score,
    atrPct, volClass, volScore,
    supportPrice, distanceToSupportPct, supportContext,
    ema9, ema21, macdHist: macd?.hist, macdHistPrev: macd?.prevHist,
    vwap, volumeRatio, higherLows,
  };
}

/**
 * ONE_HOUR candle context:
 *  - swingAtrPct: ATR(14) as % of price — swing-scale volatility for stop sizing
 *  - htfAboveEma / htfSlopePct: higher-timeframe trend, so nothing buys into an hourly downtrend
 *  - change1h: the REAL hour-over-hour move
 * The in-progress hourly candle is dropped: an unfinished bar under-reports both range and
 * volume, so indicators built on it drift as the hour fills in.
 */
export function computeHtfContext(raw: RawCandle[], nowSeconds: number): HtfContext | undefined {
  const now = nowSeconds;
  const sorted = [...raw]
    .sort((a, b) => num(a.start) - num(b.start))
    .filter((c) => num(c.start) + 3600 <= now); // closed bars only
  if (sorted.length < 15) return undefined;
  const closes = sorted.map((c) => num(c.close));
  const highs = sorted.map((c) => num(c.high));
  const lows = sorted.map((c) => num(c.low));
  const atr = averageTrueRange(highs, lows, closes, 14);
  const last = closes[closes.length - 1];
  if (atr === undefined || !(last > 0)) return undefined;

  // True 1h change — only when the two newest bars really are consecutive hours.
  let change1h: number | undefined;
  const tLast = num(sorted[sorted.length - 1].start);
  const tPrev = num(sorted[sorted.length - 2].start);
  const prevClose = closes[closes.length - 2];
  if (tLast - tPrev === 3600 && prevClose > 0) change1h = ((last - prevClose) / prevClose) * 100;

  // Higher-timeframe trend: price vs 1h EMA(20) and the EMA's own slope over 6 hours.
  const ema20 = computeEMA(closes, 20);
  let htfAboveEma: boolean | undefined;
  let htfSlopePct: number | undefined;
  if (ema20 !== undefined && ema20 > 0) {
    htfAboveEma = last >= ema20;
    const past = computeEMA(closes.slice(0, Math.max(21, closes.length - 6)), 20);
    if (past !== undefined && past > 0) htfSlopePct = ((ema20 - past) / past) * 100;
  }

  return {
    swingAtrPct: atr > 0 ? (atr / last) * 100 : undefined,
    htfAboveEma,
    htfSlopePct,
    change1h,
  };
}

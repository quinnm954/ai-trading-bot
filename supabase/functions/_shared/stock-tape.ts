// ── STOCK TAPE GATE ──────────────────────────────────────────────────────────
// The crypto tape gate reads the top-40 crypto names. That says nothing about
// equities, so stocks get their own broad-market read: index-ETF trend plus the
// breadth of the tradable stock universe.
//
// Thresholds are equity-scaled. A -0.5% day on the S&P is a meaningful risk-off
// session, not the noise the same number represents in crypto, so the bar sits
// closer to flat and the 1-day leg dominates.

export const STOCK_TAPE_INDEX_SYMBOLS = ['SPY', 'QQQ', 'IWM'];

export const STOCK_TAPE_MIN_INDEX_PCT = -0.35; // avg index day change
export const STOCK_TAPE_MIN_BREADTH = 0.45;    // share of universe up on the day
export const STOCK_TAPE_MIN_SAMPLE = 10;

export interface StockTapeRead {
  rising: boolean;
  indexAvg: number;
  breadth: number;
  sampleSize: number;
  label: string;
}

export function evaluateStockTape(
  indexChanges: number[],
  universeChanges: number[],
  thresholds: { minIndexPct?: number; minBreadth?: number } = {},
): StockTapeRead {
  const minIndexPct = thresholds.minIndexPct ?? STOCK_TAPE_MIN_INDEX_PCT;
  const minBreadth = thresholds.minBreadth ?? STOCK_TAPE_MIN_BREADTH;

  const idx = indexChanges.filter((v) => Number.isFinite(v));
  const uni = universeChanges.filter((v) => Number.isFinite(v));

  if (idx.length === 0 || uni.length < STOCK_TAPE_MIN_SAMPLE) {
    return {
      rising: false,
      indexAvg: 0,
      breadth: 0,
      sampleSize: uni.length,
      label: 'insufficient equity market data for a tape read',
    };
  }

  const indexAvg = idx.reduce((s, v) => s + v, 0) / idx.length;
  const breadth = uni.filter((v) => v > 0).length / uni.length;
  const rising = indexAvg >= minIndexPct && breadth >= minBreadth;

  return {
    rising,
    indexAvg,
    breadth,
    sampleSize: uni.length,
    label:
      `equity tape: index ${indexAvg >= 0 ? '+' : ''}${indexAvg.toFixed(2)}% ` +
      `(need ≥${minIndexPct}%), breadth ${(breadth * 100).toFixed(0)}% ` +
      `(need ≥${(minBreadth * 100).toFixed(0)}%) across ${uni.length} names`,
  };
}

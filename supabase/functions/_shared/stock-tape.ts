// ── EQUITY MARKET REGIME / TAPE GATE ─────────────────────────────────────────
// Equities need their own regime read, built from concepts that actually exist
// in this market:
//
//   • Index trend across timeframes — SPY (large cap), QQQ (growth) and IWM
//     (small cap), both today's move and position versus the 20-day average.
//   • Advance/decline breadth across the tradable universe. A rally carried by
//     three names is not a tape you want to add longs into.
//   • Volatility context — SPY's 20-day realized (annualised) volatility plus,
//     when available, the VIX-proxy ETF's day move. Expanding vol on a falling
//     index is the classic risk-off signature.
//   • Small-cap participation (IWM vs SPY) as a risk-appetite read.
//
// A single soft leg does not halt trading; the gate fails on a genuinely
// unsupportive tape (weak index trend, poor breadth, or a volatility shock).

export const STOCK_TAPE_INDEX_SYMBOLS = ['SPY', 'QQQ', 'IWM'];
export const STOCK_VIX_PROXY = 'VIXY';

export const STOCK_TAPE_MIN_INDEX_PCT = -0.35;      // avg index day change
export const STOCK_TAPE_MIN_BREADTH = 0.45;         // share of universe up on the day
export const STOCK_TAPE_MIN_AD_RATIO = 0.85;        // advancers ÷ decliners
export const STOCK_TAPE_MAX_REALIZED_VOL = 34;      // annualised %, SPY 20-day
export const STOCK_TAPE_MAX_VIX_PROXY_JUMP = 9;     // % day move in the VIX proxy
export const STOCK_TAPE_MIN_SAMPLE = 10;

export interface IndexRead {
  symbol: string;
  dayChangePct: number;
  aboveSma20: boolean;
  fiveDayChangePct: number;
}

export interface StockTapeInput {
  indices: IndexRead[];
  /** Day change % for every scanned name (index ETFs excluded). */
  universeChanges: number[];
  /** SPY 20-day realized volatility, annualised %. */
  realizedVolPct?: number | null;
  /** Day change % of the VIX-proxy ETF, when available. */
  vixProxyChangePct?: number | null;
  thresholds?: {
    minIndexPct?: number;
    minBreadth?: number;
    minAdRatio?: number;
    maxRealizedVolPct?: number;
    /** Day move in the VIX proxy that counts as a shock. Raise it to disable the leg. */
    maxVixProxyJumpPct?: number;
  };
}

export interface StockTapeRead {
  rising: boolean;
  indexAvg: number;
  breadth: number;
  advDecRatio: number;
  sampleSize: number;
  regime: 'risk_on' | 'grind' | 'risk_off' | 'vol_shock' | 'unknown';
  realizedVolPct: number | null;
  smallCapLeading: boolean;
  reasons: string[];
  label: string;
}

/** Annualised realized volatility from a close series (daily bars). */
export function realizedVolatilityPct(closes: number[], lookback = 20): number | null {
  const c = closes.filter((v) => Number.isFinite(v) && v > 0);
  if (c.length < lookback + 1) return null;
  const slice = c.slice(-(lookback + 1));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i] / slice[i - 1]));
  const mean = rets.reduce((s, v) => s + v, 0) / rets.length;
  const variance = rets.reduce((s, v) => s + (v - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

export function evaluateStockTape(input: StockTapeInput): StockTapeRead {
  const th = input.thresholds ?? {};
  const minIndexPct = th.minIndexPct ?? STOCK_TAPE_MIN_INDEX_PCT;
  const minBreadth = th.minBreadth ?? STOCK_TAPE_MIN_BREADTH;
  const minAdRatio = th.minAdRatio ?? STOCK_TAPE_MIN_AD_RATIO;
  const maxRealizedVol = th.maxRealizedVolPct ?? STOCK_TAPE_MAX_REALIZED_VOL;
  const maxVixJump = th.maxVixProxyJumpPct ?? STOCK_TAPE_MAX_VIX_PROXY_JUMP;

  const indices = input.indices.filter((i) => Number.isFinite(i.dayChangePct));
  const uni = input.universeChanges.filter((v) => Number.isFinite(v));

  if (indices.length === 0 || uni.length < STOCK_TAPE_MIN_SAMPLE) {
    return {
      rising: false,
      indexAvg: 0,
      breadth: 0,
      advDecRatio: 0,
      sampleSize: uni.length,
      regime: 'unknown',
      realizedVolPct: input.realizedVolPct ?? null,
      smallCapLeading: false,
      reasons: ['insufficient equity market data for a tape read'],
      label: 'equity tape: insufficient data — standing down',
    };
  }

  const indexAvg = indices.reduce((s, i) => s + i.dayChangePct, 0) / indices.length;
  const advancers = uni.filter((v) => v > 0).length;
  const decliners = uni.filter((v) => v < 0).length;
  const breadth = advancers / uni.length;
  const advDecRatio = decliners > 0 ? advancers / decliners : (advancers > 0 ? 3 : 0);

  const spy = indices.find((i) => i.symbol === 'SPY');
  const iwm = indices.find((i) => i.symbol === 'IWM');
  const trendUp = indices.filter((i) => i.aboveSma20).length >= Math.ceil(indices.length / 2);
  const weeklyUp = indices.filter((i) => i.fiveDayChangePct >= 0).length >= Math.ceil(indices.length / 2);
  const smallCapLeading = !!(iwm && spy && iwm.dayChangePct > spy.dayChangePct);

  const realizedVolPct = input.realizedVolPct ?? null;
  const volShock = (realizedVolPct !== null && realizedVolPct > maxRealizedVol && indexAvg < 0) ||
    (Number.isFinite(input.vixProxyChangePct ?? NaN) && (input.vixProxyChangePct as number) > maxVixJump);

  const reasons: string[] = [];
  if (indexAvg < minIndexPct) reasons.push(`index avg ${indexAvg.toFixed(2)}% below the ${minIndexPct}% floor`);
  if (breadth < minBreadth) reasons.push(`breadth ${(breadth * 100).toFixed(0)}% below ${(minBreadth * 100).toFixed(0)}%`);
  if (advDecRatio < minAdRatio) reasons.push(`advance/decline ${advDecRatio.toFixed(2)} below ${minAdRatio}`);
  if (!trendUp && !weeklyUp) reasons.push('indices below their 20-day averages and down on the week');
  if (volShock) {
    reasons.push(
      realizedVolPct !== null && realizedVolPct > maxRealizedVol
        ? `realized volatility ${realizedVolPct.toFixed(0)}% annualised on a falling tape`
        : `volatility proxy up ${(input.vixProxyChangePct as number).toFixed(1)}% today`,
    );
  }

  const rising = reasons.length === 0;

  let regime: StockTapeRead['regime'];
  if (volShock) regime = 'vol_shock';
  else if (rising && breadth >= 0.6 && indexAvg > 0.2) regime = 'risk_on';
  else if (rising) regime = 'grind';
  else regime = 'risk_off';

  const label = rising
    ? `equity tape ${regime}: index ${indexAvg >= 0 ? '+' : ''}${indexAvg.toFixed(2)}%, ` +
      `breadth ${(breadth * 100).toFixed(0)}%, A/D ${advDecRatio.toFixed(2)}` +
      (realizedVolPct !== null ? `, realized vol ${realizedVolPct.toFixed(0)}%` : '') +
      (smallCapLeading ? ', small caps leading' : '')
    : `equity tape ${regime}: ${reasons.join('; ')}`;

  return {
    rising,
    indexAvg,
    breadth,
    advDecRatio,
    sampleSize: uni.length,
    regime,
    realizedVolPct,
    smallCapLeading,
    reasons,
    label,
  };
}

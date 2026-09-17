// ── EQUITY-SPECIFIC FEATURES ─────────────────────────────────────────────────
// These are the readings an equity trader actually works from, and they have no
// crypto analogue in this codebase:
//
//   • Session VWAP and how price behaves around it (hold / reclaim / rejection).
//     VWAP is the institutional benchmark price for the day — the single most
//     used intraday reference on an equity desk.
//   • Opening range (first 30 minutes). Stocks have a real open: overnight order
//     imbalance clears in the first half hour and the resulting range acts as
//     the day's first structure. Crypto has no open, so nothing like this exists.
//   • Relative volume against the stock's own same-time-of-day history, not a
//     raw "volume vs last N bars" ratio, because equity volume is U-shaped.
//   • Overnight gap versus prior close, plus whether the gap is being filled
//     (mean reversion toward prior close) or extended (continuation).
//   • Relative strength versus SPY / a sector proxy. Single stocks mostly ride
//     the index; a name outperforming a flat-to-up tape is the real signal.
//
// Everything is computed from closed bars only, so there is no look-ahead.

export interface Bar {
  t: string; // RFC-3339
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const ET_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Eastern-time calendar day plus minutes since the 09:30 open. */
export function etParts(iso: string): { day: string; minutesFromOpen: number } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = ET_FMT.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return { day, minutesFromOpen: hour * 60 + minute - (9 * 60 + 30) };
}

export interface SessionBar extends Bar {
  minutesFromOpen: number;
}

/** Group intraday bars into regular-hours sessions keyed by ET date, oldest first. */
export function groupSessions(bars: Bar[]): Array<{ day: string; bars: SessionBar[] }> {
  const map = new Map<string, SessionBar[]>();
  for (const b of bars) {
    const p = etParts(b.t);
    if (!p) continue;
    // Regular session only: 09:30–16:00 ET. Extended-hours prints distort VWAP,
    // the opening range and relative volume.
    if (p.minutesFromOpen < 0 || p.minutesFromOpen >= 390) continue;
    const arr = map.get(p.day) ?? [];
    arr.push({ ...b, minutesFromOpen: p.minutesFromOpen });
    map.set(p.day, arr);
  }
  return Array.from(map.entries())
    .map(([day, arr]) => ({ day, bars: arr.sort((a, b) => a.minutesFromOpen - b.minutesFromOpen) }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}

export type VwapState = 'above_held' | 'reclaimed' | 'rejected' | 'below';
export type OpeningRangeState = 'breakout' | 'breakdown' | 'inside' | 'forming';
export type GapState = 'gap_up_extending' | 'gap_up_filled' | 'gap_down_reclaiming' | 'gap_down_extending' | 'flat';

export interface StockFeatures {
  symbol: string;
  lastPrice: number;
  minutesFromOpen: number;
  sessionBars: number;

  // VWAP
  vwap: number;
  vwapDistPct: number;
  vwapState: VwapState;

  // Opening range (first 30 minutes)
  orHigh: number;
  orLow: number;
  orRangePct: number;
  orState: OpeningRangeState;
  orExtensionPct: number; // % above OR high (negative = below OR low)

  // Relative volume vs the stock's own same-time-of-day history
  rvol: number;
  rvolSessions: number;

  // Gap
  prevClose: number;
  gapPct: number;
  gapState: GapState;

  // Relative strength
  rsDayPct: number;     // day change minus index day change
  rsIntradayPct: number; // last-30-min change minus index's
  rsSectorPct: number | null;
  dayChangePct: number;

  // Daily structure / volatility
  aboveSma20: boolean;
  aboveSma50: boolean;
  dailyAtrPct: number;
}

function pct(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  const slice = values.slice(-n);
  return slice.reduce((s, v) => s + v, 0) / n;
}

/** Cumulative volume up to `minutes` since the open. */
function cumulativeVolume(bars: SessionBar[], minutes: number): number {
  let sum = 0;
  for (const b of bars) {
    if (b.minutesFromOpen <= minutes) sum += b.v;
  }
  return sum;
}

export interface StockFeatureInput {
  symbol: string;
  /** Multi-day 5-minute bars, oldest first (≥ 8 sessions gives a usable RVOL). */
  intraday: Bar[];
  /** Daily bars, oldest first, including today's forming bar if present. */
  daily: Bar[];
  /** Index day change % (SPY) for relative strength. */
  indexDayChangePct: number;
  /** Index change over the last ~30 minutes, for intraday relative strength. */
  indexIntradayPct: number;
  /** Sector-ETF day change %, when a sector proxy is known. */
  sectorDayChangePct?: number | null;
}

export interface StockSession {
  day: string;
  bars: SessionBar[];
}

export function computeStockFeatures(input: StockFeatureInput): StockFeatures | null {
  return computeStockFeaturesFromSessions({
    symbol: input.symbol,
    sessions: groupSessions(input.intraday),
    daily: input.daily,
    indexDayChangePct: input.indexDayChangePct,
    indexIntradayPct: input.indexIntradayPct,
    sectorDayChangePct: input.sectorDayChangePct,
  });
}

export interface StockFeatureSessionInput {
  symbol: string;
  /** Sessions oldest-first; the LAST one is the session being traded, truncated to the decision moment. */
  sessions: StockSession[];
  daily: Bar[];
  indexDayChangePct: number;
  indexIntradayPct: number;
  sectorDayChangePct?: number | null;
  /** Bar interval in minutes (5 live, 1 in minute-level replay). */
  barMinutes?: number;
}

/**
 * Same feature set from already-grouped sessions. Historical replay groups a
 * symbol's whole minute history once and then re-slices it, which keeps the
 * per-decision cost independent of how much history is loaded.
 */
export function computeStockFeaturesFromSessions(input: StockFeatureSessionInput): StockFeatures | null {
  const sessions = input.sessions;
  if (sessions.length === 0) return null;
  const barMinutes = input.barMinutes && input.barMinutes > 0 ? input.barMinutes : 5;

  const today = sessions[sessions.length - 1];
  const bars = today.bars;
  // At least 20 minutes of tape before anything is read off the session.
  if (bars.length * barMinutes < 20) return null;

  const last = bars[bars.length - 1];
  const lastPrice = last.c;
  const minutesFromOpen = last.minutesFromOpen + barMinutes;
  /** How many bars make up a 30-minute look-back at this bar size. */
  const barsPer30m = Math.max(1, Math.round(30 / barMinutes));

  // ── VWAP (typical price × volume, session-anchored) ────────────────────────
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3;
    pv += typical * b.v;
    vol += b.v;
  }
  const vwap = vol > 0 ? pv / vol : lastPrice;
  const vwapDistPct = pct(vwap, lastPrice);

  // Rolling VWAP per bar so reclaim/rejection can be read from behaviour, not
  // just the current side of the line.
  const above: boolean[] = [];
  let rpv = 0;
  let rvolSum = 0;
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3;
    rpv += typical * b.v;
    rvolSum += b.v;
    const v = rvolSum > 0 ? rpv / rvolSum : b.c;
    above.push(b.c >= v);
  }
  const recent = above.slice(-6);
  const wasBelow = recent.slice(0, Math.max(1, recent.length - 2)).some((a) => !a);
  const nowAbove = above[above.length - 1];
  const heldAbove = recent.every((a) => a);
  let vwapState: VwapState;
  if (nowAbove && heldAbove) vwapState = 'above_held';
  else if (nowAbove && wasBelow) vwapState = 'reclaimed';
  else if (!nowAbove && recent.slice(0, -1).some((a) => a)) vwapState = 'rejected';
  else vwapState = 'below';

  // ── Opening range: first 30 minutes ───────────────────────────────────────
  const orBars = bars.filter((b) => b.minutesFromOpen < 30);
  const orComplete = minutesFromOpen >= 30 && orBars.length >= 4;
  const orHigh = orBars.length > 0 ? Math.max(...orBars.map((b) => b.h)) : last.h;
  const orLow = orBars.length > 0 ? Math.min(...orBars.map((b) => b.l)) : last.l;
  const orRangePct = orLow > 0 ? ((orHigh - orLow) / orLow) * 100 : 0;
  const orExtensionPct = lastPrice > orHigh ? pct(orHigh, lastPrice) : lastPrice < orLow ? pct(orLow, lastPrice) : 0;
  let orState: OpeningRangeState = 'forming';
  if (orComplete) {
    if (lastPrice > orHigh) orState = 'breakout';
    else if (lastPrice < orLow) orState = 'breakdown';
    else orState = 'inside';
  }

  // ── Relative volume vs same time of day, prior sessions ───────────────────
  const priorSessions = sessions.slice(0, -1).slice(-20);
  const todayCum = cumulativeVolume(bars, last.minutesFromOpen);
  const priorCums = priorSessions
    .map((s) => cumulativeVolume(s.bars, last.minutesFromOpen))
    .filter((v) => v > 0);
  const avgCum = priorCums.length > 0 ? priorCums.reduce((s, v) => s + v, 0) / priorCums.length : 0;
  const rvol = avgCum > 0 ? todayCum / avgCum : 1;

  // ── Gap versus prior close ────────────────────────────────────────────────
  const dailyCloses = input.daily.map((d) => d.c);
  const todayDailyIsToday = (() => {
    const p = input.daily.length > 0 ? etParts(input.daily[input.daily.length - 1].t) : null;
    return p?.day === today.day;
  })();
  const prevClose = todayDailyIsToday
    ? (input.daily.length >= 2 ? input.daily[input.daily.length - 2].c : bars[0].o)
    : (dailyCloses.length >= 1 ? dailyCloses[dailyCloses.length - 1] : bars[0].o);
  const sessionOpen = bars[0].o;
  const gapPct = pct(prevClose, sessionOpen);
  const sessionLow = Math.min(...bars.map((b) => b.l));
  const sessionHigh = Math.max(...bars.map((b) => b.h));
  let gapState: GapState = 'flat';
  if (gapPct >= 0.5) {
    gapState = sessionLow <= prevClose ? 'gap_up_filled' : (lastPrice > orHigh ? 'gap_up_extending' : 'gap_up_extending');
  } else if (gapPct <= -0.5) {
    gapState = sessionHigh >= prevClose ? 'gap_down_reclaiming' : 'gap_down_extending';
  }

  const dayChangePct = pct(prevClose, lastPrice);

  // ── Relative strength ─────────────────────────────────────────────────────
  const sixBarsBack = bars.length >= 7 ? bars[bars.length - 7].c : bars[0].c;
  const intradayPct = pct(sixBarsBack, lastPrice);
  const rsDayPct = dayChangePct - input.indexDayChangePct;
  const rsIntradayPct = intradayPct - input.indexIntradayPct;
  const rsSectorPct = typeof input.sectorDayChangePct === 'number'
    ? dayChangePct - input.sectorDayChangePct
    : null;

  // ── Daily structure and volatility ────────────────────────────────────────
  const closesForSma = todayDailyIsToday ? dailyCloses.slice(0, -1).concat(lastPrice) : dailyCloses.concat(lastPrice);
  const sma20 = sma(closesForSma, 20);
  const sma50 = sma(closesForSma, 50);
  const trueRanges: number[] = [];
  for (let i = 1; i < input.daily.length; i++) {
    const cur = input.daily[i];
    const prev = input.daily[i - 1];
    trueRanges.push(Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c)));
  }
  const atr14 = sma(trueRanges, 14) ?? (trueRanges.length > 0 ? trueRanges[trueRanges.length - 1] : 0);
  const dailyAtrPct = lastPrice > 0 ? (atr14 / lastPrice) * 100 : 0;

  return {
    symbol: input.symbol.toUpperCase(),
    lastPrice,
    minutesFromOpen,
    sessionBars: bars.length,
    vwap,
    vwapDistPct,
    vwapState,
    orHigh,
    orLow,
    orRangePct,
    orState,
    orExtensionPct,
    rvol,
    rvolSessions: priorCums.length,
    prevClose,
    gapPct,
    gapState,
    rsDayPct,
    rsIntradayPct,
    rsSectorPct,
    dayChangePct,
    aboveSma20: sma20 !== null ? lastPrice > sma20 : false,
    aboveSma50: sma50 !== null ? lastPrice > sma50 : false,
    dailyAtrPct,
  };
}

/** Coarse sector proxy so relative strength has a sector leg for common names. */
export const SECTOR_ETF_BY_SYMBOL: Record<string, string> = {
  AAPL: 'XLK', MSFT: 'XLK', NVDA: 'SMH', AVGO: 'SMH', AMD: 'SMH', MU: 'SMH', QCOM: 'SMH', TXN: 'SMH', INTC: 'SMH',
  CRM: 'XLK', ORCL: 'XLK', ADBE: 'XLK', PLTR: 'XLK', SNOW: 'XLK', DDOG: 'XLK', SHOP: 'XLK', SQ: 'XLK', PYPL: 'XLK',
  AMZN: 'XLY', TSLA: 'XLY', HD: 'XLY', MCD: 'XLY', NKE: 'XLY', SBUX: 'XLY', ABNB: 'XLY', RIVN: 'XLY', F: 'XLY', GM: 'XLY',
  GOOGL: 'XLC', META: 'XLC', NFLX: 'XLC', DIS: 'XLC',
  JPM: 'XLF', BAC: 'XLF', WFC: 'XLF', GS: 'XLF', V: 'XLF', MA: 'XLF', COIN: 'XLF',
  XOM: 'XLE', CVX: 'XLE',
  UNH: 'XLV', JNJ: 'XLV', LLY: 'XLV', PFE: 'XLV', MRK: 'XLV', ABBV: 'XLV',
  COST: 'XLP', WMT: 'XLP',
};

export const SECTOR_ETFS = Array.from(new Set(Object.values(SECTOR_ETF_BY_SYMBOL)));

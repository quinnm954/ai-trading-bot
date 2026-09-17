// ── EQUITY INSTRUMENT CLASSES ────────────────────────────────────────────────
// "Stocks" is not one instrument. A mega-cap common share, a broad-index ETF, a
// 3× leveraged sector fund, a foreign ADR, a REIT and a $2 micro-cap all trade
// differently and need different guardrails. This module classifies a tradable
// US listing and hands back the trading profile the desk should use for it:
// liquidity floors, spread tolerance, stop bounds, participation requirements
// and how much of the normal position size it deserves.
//
// Long-only system: inverse/bear funds are classified but not tradable, because
// buying them is a short bet and the engine only takes longs into a rising tape.

export type InstrumentKind =
  | 'common_stock'
  | 'etf'
  | 'leveraged_etf'
  | 'inverse_etf'
  | 'adr'
  | 'reit'
  | 'small_cap';

export interface InstrumentClassification {
  symbol: string;
  kind: InstrumentKind;
  /** Extra descriptors (e.g. 'sector_etf', 'low_priced', 'thin'). */
  tags: string[];
  /** Declared leverage for leveraged/inverse funds (1 for everything else). */
  leverage: number;
  label: string;
}

export interface InstrumentProfile {
  kind: InstrumentKind;
  label: string;
  /** Hard tradability — false for products this long-only engine must not buy. */
  tradable: boolean;
  skipReason?: string;

  // Universe/liquidity gates
  minPrice: number;
  maxPrice: number;
  minDollarVolume: number;
  /** Widest acceptable bid/ask spread as % of price. */
  maxSpreadPct: number;

  // Exit geometry shaping (applied on top of the base stock geometry)
  atrMultScale: number;
  minStopPct: number;
  maxStopPct: number;
  tpFloorPct: number;
  /** Multiplier on the max hold window (leveraged decay ⇒ shorter holds). */
  holdScale: number;

  // Entry-playbook shaping
  /** Minimum relative volume required for this instrument class. */
  minRvol: number;
  /** Added to the playbook conviction floor (positive = stricter). */
  scoreDelta: number;
  minDailyAtrPct: number;
  maxDailyAtrPct: number;
  /** Earnings vetoes only apply to single-company instruments. */
  earningsRelevant: boolean;
  /** Fraction of the account's normal max position size. */
  positionScale: number;
  /** Leveraged funds must be moving with their index, never against it. */
  requireIndexAlignment: boolean;
}

const LEVERAGE_RE = /(^|[^A-Z0-9])(-?[1-4](\.5)?)\s?X([^A-Z0-9]|$)/i;
const BULL_RE = /\b(bull|ultra ?pro|ultra|long)\b/i;
const BEAR_RE = /\b(bear|short|inverse)\b/i;
const FUND_RE = /\b(etf|etn|fund|trust|index|shares|portfolio|ucits|strategy)\b/i;
const ADR_RE = /\b(adr|ads|american depositary|depositary receipt|sponsored)\b/i;
const REIT_RE = /\b(reit|real estate investment trust|realty|properties|property trust)\b/i;
const SECTOR_ETF = new Set([
  'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLC', 'XLRE',
  'SMH', 'SOXX', 'IBB', 'XBI', 'KRE', 'ITB', 'XRT', 'XOP', 'GDX', 'ARKK',
]);
const BROAD_ETF = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'RSP', 'MDY', 'TLT', 'IEF', 'HYG', 'GLD', 'SLV']);

/**
 * Classify a listing from its symbol, issuer name and live tape stats.
 * `name` is Alpaca's asset name; when it is missing the symbol lists still
 * catch the common index and sector funds.
 */
export function classifyInstrument(input: {
  symbol: string;
  name?: string | null;
  price?: number | null;
  dollarVolume?: number | null;
}): InstrumentClassification {
  const symbol = String(input.symbol).toUpperCase();
  const name = String(input.name ?? '');
  const price = Number(input.price) || 0;
  const dollarVolume = Number(input.dollarVolume) || 0;
  const tags: string[] = [];

  const levMatch = name.match(LEVERAGE_RE);
  const declared = levMatch ? Math.abs(Number(levMatch[2])) : 1;
  const bearish = BEAR_RE.test(name) || (levMatch ? Number(levMatch[2]) < 0 : false);
  const bullish = BULL_RE.test(name);
  const isFund = FUND_RE.test(name) || BROAD_ETF.has(symbol) || SECTOR_ETF.has(symbol);

  if (price > 0 && price < 5) tags.push('low_priced');
  if (dollarVolume > 0 && dollarVolume < 8_000_000) tags.push('thin');
  if (SECTOR_ETF.has(symbol)) tags.push('sector_etf');
  if (BROAD_ETF.has(symbol)) tags.push('broad_etf');

  let kind: InstrumentKind;
  if (isFund && bearish) {
    kind = 'inverse_etf';
  } else if (isFund && (declared > 1 || bullish)) {
    kind = 'leveraged_etf';
  } else if (isFund) {
    kind = 'etf';
  } else if (REIT_RE.test(name)) {
    kind = 'reit';
  } else if (ADR_RE.test(name)) {
    kind = 'adr';
  } else if (tags.includes('low_priced') || tags.includes('thin')) {
    kind = 'small_cap';
  } else {
    kind = 'common_stock';
  }

  // A low-priced or thin single name is a micro-cap regardless of its sector.
  if ((kind === 'common_stock' || kind === 'reit' || kind === 'adr') &&
      (tags.includes('low_priced') || tags.includes('thin'))) {
    tags.push(kind);
    kind = 'small_cap';
  }

  return { symbol, kind, tags, leverage: declared, label: KIND_LABEL[kind] };
}

const KIND_LABEL: Record<InstrumentKind, string> = {
  common_stock: 'common stock',
  etf: 'ETF',
  leveraged_etf: 'leveraged ETF',
  inverse_etf: 'inverse/bear fund',
  adr: 'ADR',
  reit: 'REIT',
  small_cap: 'small-cap / low-priced',
};

const BASE: Omit<InstrumentProfile, 'kind' | 'label'> = {
  tradable: true,
  minPrice: 3,
  maxPrice: 2000,
  minDollarVolume: 20_000_000,
  maxSpreadPct: 0.25,
  atrMultScale: 1,
  minStopPct: 0.4,
  maxStopPct: 1.5,
  tpFloorPct: 0.7,
  holdScale: 1,
  minRvol: 1.15,
  scoreDelta: 0,
  minDailyAtrPct: 0.8,
  maxDailyAtrPct: 8,
  earningsRelevant: true,
  positionScale: 1,
  requireIndexAlignment: false,
};

const PROFILES: Record<InstrumentKind, Partial<InstrumentProfile>> = {
  common_stock: {},

  // Baskets: no single-company earnings risk, calmer ranges, so the ATR floor
  // and target floor come down rather than vetoing every broad fund as "quiet".
  etf: {
    minPrice: 5,
    minDollarVolume: 25_000_000,
    maxSpreadPct: 0.2,
    minStopPct: 0.3,
    maxStopPct: 1.3,
    tpFloorPct: 0.5,
    minDailyAtrPct: 0.4,
    maxDailyAtrPct: 5,
    earningsRelevant: false,
    scoreDelta: -3,
  },

  // 2×/3× funds: the ATR is already inflated, so scale the multiplier DOWN and
  // widen the clamp instead; size is cut by the leverage factor and holds are
  // shortened because daily-reset decay punishes multi-session holds.
  leveraged_etf: {
    minPrice: 5,
    minDollarVolume: 30_000_000,
    maxSpreadPct: 0.3,
    atrMultScale: 0.75,
    minStopPct: 0.8,
    maxStopPct: 3.2,
    tpFloorPct: 1.2,
    holdScale: 0.34, // roughly one session
    minRvol: 1.3,
    scoreDelta: 5,
    minDailyAtrPct: 1.5,
    maxDailyAtrPct: 20,
    earningsRelevant: false,
    positionScale: 0.5,
    requireIndexAlignment: true,
  },

  inverse_etf: {
    tradable: false,
    skipReason: 'inverse/bear fund — buying it is a short bet, and this engine only takes longs into a rising tape',
    earningsRelevant: false,
  },

  // Foreign listings: home-market close drives the US open, so overnight gap
  // behaviour matters more and liquidity is usually thinner than a US peer.
  adr: {
    minDollarVolume: 10_000_000,
    maxSpreadPct: 0.35,
    scoreDelta: 2,
    positionScale: 0.8,
  },

  // Rate-sensitive and structurally calmer than the tape: let a smaller ATR
  // qualify, but keep the target floor honest.
  reit: {
    minDollarVolume: 8_000_000,
    maxSpreadPct: 0.3,
    minStopPct: 0.35,
    minDailyAtrPct: 0.6,
    maxDailyAtrPct: 6,
    positionScale: 0.9,
  },

  // Sub-$5 / thin names: real opportunity, real slippage. Wide stops (they move),
  // small size, strict spread and participation requirements, and one session max.
  small_cap: {
    minPrice: 1,
    maxPrice: 2000,
    minDollarVolume: 3_000_000,
    maxSpreadPct: 0.8,
    atrMultScale: 1,
    minStopPct: 0.9,
    maxStopPct: 3.5,
    tpFloorPct: 1.5,
    holdScale: 0.5,
    minRvol: 1.8,
    scoreDelta: 8,
    minDailyAtrPct: 1.5,
    maxDailyAtrPct: 25,
    positionScale: 0.35,
  },
};

export function instrumentProfile(kind: InstrumentKind): InstrumentProfile {
  return { ...BASE, ...PROFILES[kind], kind, label: KIND_LABEL[kind] };
}

/** Profile for a classification, with per-tag hardening applied. */
export function profileFor(c: InstrumentClassification): InstrumentProfile {
  const p = instrumentProfile(c.kind);
  if (c.tags.includes('thin')) {
    p.maxSpreadPct = Math.min(p.maxSpreadPct, 0.6);
    p.positionScale = Math.min(p.positionScale, 0.35);
    p.minRvol = Math.max(p.minRvol, 1.8);
  }
  if (c.kind === 'leveraged_etf' && c.leverage >= 3) {
    p.positionScale = Math.min(p.positionScale, 0.34);
    p.scoreDelta = Math.max(p.scoreDelta, 8);
  }
  return p;
}

/** Does this listing clear its class's own liquidity/spread bar? */
export function passesInstrumentLiquidity(
  p: InstrumentProfile,
  stats: { price: number; dollarVolume: number; spreadPct?: number | null },
): { ok: boolean; reason?: string } {
  if (!p.tradable) return { ok: false, reason: p.skipReason ?? 'instrument class not tradable' };
  if (!(stats.price >= p.minPrice)) return { ok: false, reason: `price $${stats.price.toFixed(2)} below the $${p.minPrice} floor for a ${p.label}` };
  if (stats.price > p.maxPrice) return { ok: false, reason: `price $${stats.price.toFixed(2)} above the $${p.maxPrice} ceiling` };
  if (!(stats.dollarVolume >= p.minDollarVolume)) {
    return { ok: false, reason: `$${(stats.dollarVolume / 1e6).toFixed(1)}M daily turnover under the $${(p.minDollarVolume / 1e6).toFixed(0)}M floor for a ${p.label}` };
  }
  const spread = Number(stats.spreadPct);
  if (Number.isFinite(spread) && spread > p.maxSpreadPct) {
    return { ok: false, reason: `spread ${spread.toFixed(2)}% wider than the ${p.maxSpreadPct.toFixed(2)}% limit for a ${p.label}` };
  }
  return { ok: true };
}

/** Symbols that are listings but not ordinary tradable shares (warrants, units, rights). */
export function isExcludedListing(symbol: string, name?: string | null): boolean {
  const s = symbol.toUpperCase();
  if (/[.\/]/.test(s)) return true;                    // preferreds / class suffixes with punctuation
  if (/(W|WS|R|RT|U|UN)$/.test(s) && s.length >= 4) {  // warrants, rights, units
    return /\b(warrant|right|unit)\b/i.test(String(name ?? ''));
  }
  return /\b(warrant|right|unit|preferred|acquisition corp)\b/i.test(String(name ?? ''));
}

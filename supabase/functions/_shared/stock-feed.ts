// ── STOCK MARKET FEED ────────────────────────────────────────────────────────
// Mirrors the crypto market-feed interface so the engine's scoring, indicator and
// candle code is reused unchanged — only the source differs. Never fabricates a
// price: a failed read returns an empty quote list so the caller stands down.
//
// The universe is deliberately multi-instrument: common shares, broad and sector
// ETFs, leveraged funds, ADRs, REITs and small/low-priced names. Each listing is
// classified (see instrument-classes.ts) and screened against the liquidity and
// spread floors of its OWN class rather than one blanket rule, so a $2 micro-cap
// must clear a far stricter spread test than SPY does.

import type { AlpacaCreds } from './alpaca.ts';
import { getBarsMany, getSnapshots, listTradableAssets } from './alpaca.ts';
import type { FeedQuote } from './market-feed.ts';
import { STOCK_TAPE_INDEX_SYMBOLS } from './stock-tape.ts';
import {
  classifyInstrument,
  isExcludedListing,
  passesInstrumentLiquidity,
  profileFor,
  type InstrumentClassification,
  type InstrumentKind,
} from './instrument-classes.ts';

/** Liquid large-cap common shares. */
export const STOCK_CORE_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX',
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'V', 'MA', 'AXP', 'XOM',
  'CVX', 'COP', 'SLB', 'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'ABBV', 'AMGN',
  'COST', 'WMT', 'TGT', 'HD', 'LOW', 'MCD', 'NKE', 'SBUX', 'DIS', 'CMCSA',
  'CRM', 'ORCL', 'ADBE', 'NOW', 'INTC', 'MU', 'QCOM', 'TXN', 'ARM', 'ASML',
  'PLTR', 'UBER', 'LYFT', 'COIN', 'HOOD', 'SHOP', 'PYPL', 'SNOW', 'DDOG', 'CRWD',
  'ABNB', 'DASH', 'RIVN', 'LCID', 'F', 'GM', 'DAL', 'AAL', 'BA', 'CAT',
  'DE', 'GE', 'HON', 'RTX', 'LMT', 'MMM', 'PG', 'KO', 'PEP', 'T',
  'VZ', 'CSCO', 'IBM', 'MRVL', 'SMCI', 'ON', 'ANET', 'PANW', 'MDB', 'NET',
];

/** Broad-market and fixed-income/commodity ETFs. */
export const STOCK_ETF_UNIVERSE = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'VOO', 'VTI', 'RSP', 'MDY', 'EFA', 'EEM',
  'TLT', 'IEF', 'HYG', 'LQD', 'GLD', 'SLV', 'USO', 'UNG', 'FXI', 'EWJ',
];

/** Sector and industry ETFs. */
export const STOCK_SECTOR_ETF_UNIVERSE = [
  'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLC',
  'XLRE', 'SMH', 'SOXX', 'IBB', 'XBI', 'KRE', 'ITB', 'XRT', 'XOP', 'GDX',
  'ARKK', 'JETS', 'TAN', 'LIT', 'URA',
];

/** Leveraged (long) funds — traded small, short-hold, index-aligned only. */
export const STOCK_LEVERAGED_ETF_UNIVERSE = [
  'TQQQ', 'UPRO', 'SPXL', 'SOXL', 'TNA', 'UDOW', 'FAS', 'LABU', 'NUGT', 'ERX',
  'QLD', 'SSO', 'UWM', 'ROM', 'USD', 'TECL', 'CURE', 'DFEN', 'NAIL', 'WEBL',
];

/** Foreign listings (ADRs). */
export const STOCK_ADR_UNIVERSE = [
  'BABA', 'TSM', 'ASX', 'SHOP', 'SE', 'PDD', 'JD', 'NIO', 'XPEV', 'LI',
  'BIDU', 'INFY', 'HDB', 'SONY', 'TM', 'SAP', 'NVO', 'AZN', 'GSK', 'BP',
  'SHEL', 'TTE', 'RIO', 'BHP', 'VALE', 'ITUB', 'PBR', 'BBD', 'ERIC', 'NOK',
];

/** Real-estate investment trusts. */
export const STOCK_REIT_UNIVERSE = [
  'PLD', 'AMT', 'EQIX', 'SPG', 'O', 'PSA', 'CCI', 'WELL', 'DLR', 'VICI',
  'AVB', 'EQR', 'INVH', 'ARE', 'IRM', 'WPC', 'STAG', 'NNN', 'KIM', 'HST',
];

/** Frequently active low-priced / small-cap names (still screened for liquidity). */
export const STOCK_SMALL_CAP_UNIVERSE = [
  'SOFI', 'PLUG', 'RIOT', 'MARA', 'CLSK', 'BITF', 'HUT', 'IONQ', 'RGTI', 'QBTS',
  'BBAI', 'ACHR', 'JOBY', 'OPEN', 'CHPT', 'NKLA', 'FCEL', 'AMC', 'GME', 'WBD',
  'PTON', 'AFRM', 'UPST', 'DNA', 'RKLB', 'ASTS', 'LUNR', 'SMR', 'OKLO', 'TLRY',
];

export const STOCK_FULL_UNIVERSE = Array.from(new Set([
  ...STOCK_CORE_UNIVERSE,
  ...STOCK_ETF_UNIVERSE,
  ...STOCK_SECTOR_ETF_UNIVERSE,
  ...STOCK_LEVERAGED_ETF_UNIVERSE,
  ...STOCK_ADR_UNIVERSE,
  ...STOCK_REIT_UNIVERSE,
  ...STOCK_SMALL_CAP_UNIVERSE,
  ...STOCK_TAPE_INDEX_SYMBOLS,
]));

export interface StockUniverseOptions {
  /** Max names to return, ranked by dollar volume. */
  limit?: number;
  /** Restrict the scan to these instrument classes. */
  kinds?: InstrumentKind[];
  /** Extra discovery beyond the curated lists (costs one snapshot call per 100). */
  discover?: boolean;
}

export interface StockQuote extends FeedQuote {
  /** Bid/ask spread as % of mid, when quoted. */
  spreadPct?: number;
  kind: InstrumentKind;
  instrumentLabel: string;
  leverage: number;
  tags: string[];
}

export interface StockFeedResult {
  quotes: StockQuote[];
  source: 'alpaca' | 'none';
  fetchedAt: string;
  /** Index-ETF day changes for the equity tape gate. */
  indexChanges: number[];
  /** Classification per symbol, for the engine's geometry/playbook shaping. */
  instruments: Record<string, InstrumentClassification>;
  /** Count of names rejected by their class's liquidity/spread floor. */
  screenedOut: number;
  kindCounts: Partial<Record<InstrumentKind, number>>;
}

/**
 * Live equity quotes for the scan universe, with a real 1h leg enriched from
 * hourly bars (never a fabricated 0%).
 */
export async function fetchStockMarket(
  creds: AlpacaCreds,
  opts: StockUniverseOptions = {},
): Promise<StockFeedResult> {
  const fetchedAt = new Date().toISOString();
  const limit = opts.limit ?? 90;
  const empty: StockFeedResult = {
    quotes: [], source: 'none', fetchedAt, indexChanges: [], instruments: {}, screenedOut: 0, kindCounts: {},
  };

  const universe = await resolveUniverse(creds, { discover: opts.discover !== false });
  if (universe.symbols.length === 0) return empty;

  const snapshots = await getSnapshots(creds, universe.symbols);
  if (snapshots.length === 0) return empty;

  const instruments: Record<string, InstrumentClassification> = {};
  const kindCounts: Partial<Record<InstrumentKind, number>> = {};
  const eligible: Array<{ snap: typeof snapshots[number]; cls: InstrumentClassification }> = [];
  let screenedOut = 0;

  for (const snap of snapshots) {
    const cls = classifyInstrument({
      symbol: snap.symbol,
      name: universe.names[snap.symbol],
      price: snap.price,
      dollarVolume: snap.volume,
    });
    instruments[snap.symbol] = cls;

    if (opts.kinds && !opts.kinds.includes(cls.kind)) continue;

    const profile = profileFor(cls);
    const check = passesInstrumentLiquidity(profile, {
      price: snap.price,
      dollarVolume: snap.volume,
      spreadPct: snap.spreadPct,
    });
    if (!check.ok) {
      screenedOut++;
      continue;
    }
    kindCounts[cls.kind] = (kindCounts[cls.kind] ?? 0) + 1;
    eligible.push({ snap, cls });
  }

  // Rank by turnover, but keep the book multi-instrument: no single class may take
  // more than 40% of the scan list, so leveraged funds can't crowd out everything.
  const perKindCap = Math.max(4, Math.floor(limit * 0.4));
  const taken: Record<string, number> = {};
  const ranked = eligible
    .sort((a, b) => b.snap.volume - a.snap.volume)
    .filter(({ cls }) => {
      const n = (taken[cls.kind] ?? 0) + 1;
      if (n > perKindCap) return false;
      taken[cls.kind] = n;
      return true;
    })
    .slice(0, limit);

  // The index ETFs feed the tape gate even if they fall outside the scan cut.
  const indexSnaps = snapshots.filter((s) => STOCK_TAPE_INDEX_SYMBOLS.includes(s.symbol));
  const indexChanges = indexSnaps.map((s) => s.change24h).filter((v) => Number.isFinite(v));

  // Real hourly leg: last few hourly bars per name.
  const sinceISO = new Date(Date.now() - 8 * 3600 * 1000).toISOString();
  const hourly = await getBarsMany(creds, ranked.map(({ snap }) => snap.symbol), '1Hour', sinceISO, undefined, 6);

  const quotes: StockQuote[] = [];
  for (const { snap, cls } of ranked) {
    const bars = hourly[snap.symbol] ?? [];
    let change1h = Number.NaN;
    if (bars.length >= 2) {
      const prev = bars[bars.length - 2].c;
      const last = bars[bars.length - 1].c;
      if (prev > 0 && last > 0) change1h = ((last - prev) / prev) * 100;
    }
    if (!Number.isFinite(change1h)) continue; // omit rather than publish a fake flat move
    quotes.push({
      symbol: snap.symbol,
      price: snap.price,
      change1h,
      change24h: snap.change24h,
      change7d: 0,
      volume: snap.volume,
      high24h: snap.high24h,
      low24h: snap.low24h,
      spreadPct: Number.isFinite(Number(snap.spreadPct)) ? Number(snap.spreadPct) : undefined,
      kind: cls.kind,
      instrumentLabel: cls.label,
      leverage: cls.leverage,
      tags: cls.tags,
    });
  }

  return {
    quotes,
    source: quotes.length > 0 ? 'alpaca' : 'none',
    fetchedAt,
    indexChanges,
    instruments,
    screenedOut,
    kindCounts,
  };
}

interface UniverseCache {
  symbols: string[];
  names: Record<string, string>;
  at: number;
}
let universeCache: UniverseCache | null = null;
const UNIVERSE_TTL_MS = 6 * 3600 * 1000;
/** Extra Alpaca listings sampled per refresh beyond the curated lists. */
const DISCOVERY_BATCH = 300;

/**
 * Tradable US listings for the scan. Starts from the curated multi-instrument
 * lists, adds a rotating slice of everything else Alpaca will trade (so newly
 * active names can be found), and keeps issuer names for classification.
 */
export async function resolveUniverse(
  creds: AlpacaCreds,
  opts: { discover?: boolean } = {},
): Promise<{ symbols: string[]; names: Record<string, string> }> {
  if (universeCache && Date.now() - universeCache.at < UNIVERSE_TTL_MS) {
    return { symbols: universeCache.symbols, names: universeCache.names };
  }

  const assets = await listTradableAssets(creds);
  if (assets.length === 0) {
    return { symbols: [...STOCK_FULL_UNIVERSE], names: {} };
  }

  const names: Record<string, string> = {};
  const tradable = new Map<string, string>();
  for (const a of assets) {
    if (isExcludedListing(a.symbol, a.name)) continue;
    tradable.set(a.symbol, a.name);
    names[a.symbol] = a.name;
  }

  const curated = STOCK_FULL_UNIVERSE.filter((s) => tradable.has(s));
  const chosen = new Set(curated);

  if (opts.discover !== false) {
    // Rotate the discovery window by day so coverage widens over time without
    // snapshotting eleven thousand listings every cycle.
    const rest = Array.from(tradable.keys()).filter((s) => !chosen.has(s)).sort();
    if (rest.length > 0) {
      const day = Math.floor(Date.now() / 86_400_000);
      const offset = (day * DISCOVERY_BATCH) % rest.length;
      for (let i = 0; i < Math.min(DISCOVERY_BATCH, rest.length); i++) {
        chosen.add(rest[(offset + i) % rest.length]);
      }
    }
  }

  for (const s of STOCK_TAPE_INDEX_SYMBOLS) if (tradable.has(s)) chosen.add(s);

  const symbols = Array.from(chosen);
  universeCache = { symbols, names, at: Date.now() };
  return { symbols, names };
}

/** Whether a symbol may be traded fractionally (drives order quantity rounding). */
export async function fractionableMap(
  creds: AlpacaCreds,
  symbols: string[],
): Promise<Record<string, boolean>> {
  const assets = await listTradableAssets(creds);
  const out: Record<string, boolean> = {};
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));
  for (const a of assets) {
    if (wanted.has(a.symbol)) out[a.symbol] = a.fractionable;
  }
  return out;
}

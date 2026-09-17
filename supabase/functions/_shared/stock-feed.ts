// ── STOCK MARKET FEED ────────────────────────────────────────────────────────
// Mirrors the crypto market-feed interface so the engine's scoring, indicator and
// candle code is reused unchanged — only the source differs. Never fabricates a
// price: a failed read returns an empty quote list so the caller stands down.

import type { AlpacaCreds } from './alpaca.ts';
import { getBarsMany, getSnapshots, listTradableAssets } from './alpaca.ts';
import type { FeedQuote } from './market-feed.ts';
import { STOCK_TAPE_INDEX_SYMBOLS } from './stock-tape.ts';

/** Liquid, sanely priced default universe used when an asset scan is unavailable. */
export const STOCK_CORE_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX',
  'JPM', 'BAC', 'WFC', 'GS', 'V', 'MA', 'XOM', 'CVX', 'UNH', 'JNJ',
  'LLY', 'PFE', 'MRK', 'ABBV', 'COST', 'WMT', 'HD', 'MCD', 'NKE', 'SBUX',
  'DIS', 'CRM', 'ORCL', 'ADBE', 'INTC', 'MU', 'QCOM', 'TXN', 'PLTR', 'UBER',
  'COIN', 'SHOP', 'SQ', 'PYPL', 'SNOW', 'DDOG', 'ABNB', 'RIVN', 'F', 'GM',
  'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'SMH', 'ARKK', 'TLT',
];

export interface StockUniverseOptions {
  /** Skip anything below this share price (penny/illiquid names). */
  minPrice?: number;
  /** Skip anything above this share price (position sizing gets lumpy). */
  maxPrice?: number;
  /** Minimum daily dollar volume. */
  minDollarVolume?: number;
  /** Max names to return, ranked by dollar volume. */
  limit?: number;
}

export interface StockFeedResult {
  quotes: FeedQuote[];
  source: 'alpaca' | 'none';
  fetchedAt: string;
  /** Index-ETF day changes for the equity tape gate. */
  indexChanges: number[];
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
  const minPrice = opts.minPrice ?? 3;
  const maxPrice = opts.maxPrice ?? 2000;
  const minDollarVolume = opts.minDollarVolume ?? 20_000_000;
  const limit = opts.limit ?? 60;

  const symbols = await resolveUniverse(creds);
  if (symbols.length === 0) return { quotes: [], source: 'none', fetchedAt, indexChanges: [] };

  const snapshots = await getSnapshots(creds, symbols);
  if (snapshots.length === 0) return { quotes: [], source: 'none', fetchedAt, indexChanges: [] };

  const eligible = snapshots
    .filter((s) => s.price >= minPrice && s.price <= maxPrice && s.volume >= minDollarVolume)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, limit);

  // The index ETFs feed the tape gate even if they fall outside the scan cut.
  const indexSnaps = snapshots.filter((s) => STOCK_TAPE_INDEX_SYMBOLS.includes(s.symbol));
  const indexChanges = indexSnaps.map((s) => s.change24h).filter((v) => Number.isFinite(v));

  // Real hourly leg: last few hourly bars per name.
  const sinceISO = new Date(Date.now() - 8 * 3600 * 1000).toISOString();
  const hourly = await getBarsMany(creds, eligible.map((s) => s.symbol), '1Hour', sinceISO, undefined, 6);

  const quotes: FeedQuote[] = [];
  for (const s of eligible) {
    const bars = hourly[s.symbol] ?? [];
    let change1h = Number.NaN;
    if (bars.length >= 2) {
      const prev = bars[bars.length - 2].c;
      const last = bars[bars.length - 1].c;
      if (prev > 0 && last > 0) change1h = ((last - prev) / prev) * 100;
    }
    if (!Number.isFinite(change1h)) continue; // omit rather than publish a fake flat move
    quotes.push({
      symbol: s.symbol,
      price: s.price,
      change1h,
      change24h: s.change24h,
      change7d: 0,
      volume: s.volume,
      high24h: s.high24h,
      low24h: s.low24h,
    });
  }

  return {
    quotes,
    source: quotes.length > 0 ? 'alpaca' : 'none',
    fetchedAt,
    indexChanges,
  };
}

let universeCache: { symbols: string[]; at: number } | null = null;
const UNIVERSE_TTL_MS = 6 * 3600 * 1000;

/** Tradable US equities/ETFs from Alpaca, falling back to the core list. */
export async function resolveUniverse(creds: AlpacaCreds): Promise<string[]> {
  if (universeCache && Date.now() - universeCache.at < UNIVERSE_TTL_MS) {
    return universeCache.symbols;
  }

  const assets = await listTradableAssets(creds);
  if (assets.length === 0) {
    return Array.from(new Set([...STOCK_CORE_UNIVERSE, ...STOCK_TAPE_INDEX_SYMBOLS]));
  }

  const tradable = new Set(assets.map((a) => a.symbol));
  // Alpaca lists ~11k assets; snapshotting all of them every cycle is wasteful.
  // Start from the liquid core plus index ETFs, keeping only names Alpaca will trade.
  const symbols = Array.from(new Set([...STOCK_CORE_UNIVERSE, ...STOCK_TAPE_INDEX_SYMBOLS]))
    .filter((s) => tradable.has(s));

  universeCache = { symbols, at: Date.now() };
  return symbols;
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

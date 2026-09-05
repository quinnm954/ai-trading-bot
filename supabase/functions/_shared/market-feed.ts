// Shared LIVE market feed + regime classification.
//
// SAFETY: this module never fabricates prices. If every upstream feed fails it
// returns an empty quote list so callers can stand down for the cycle instead of
// scoring a regime (or entering trades) on stale/mock numbers.

export interface FeedQuote {
  symbol: string;
  price: number;
  change1h: number;
  change24h: number;
  change7d: number;
  volume: number;
  high24h: number;
  low24h: number;
}

export interface FeedResult {
  quotes: FeedQuote[];
  source: 'coingecko' | 'coinbase' | 'coincap' | 'none';
  fetchedAt: string;
}

// Top-100 crypto universe by market cap (CoinGecko ids).
const COINGECKO_IDS = [
  'bitcoin', 'ethereum', 'tether', 'xrp', 'bnb', 'solana', 'usdc', 'dogecoin',
  'cardano', 'tron', 'avalanche-2', 'chainlink', 'shiba-inu', 'stellar', 'polkadot',
  'hedera', 'bitcoin-cash', 'uniswap', 'sui', 'litecoin', 'pepe', 'near', 'aptos',
  'internet-computer', 'ethereum-classic', 'render-token', 'cronos', 'kaspa',
  'aave', 'vechain', 'matic-network', 'algorand', 'cosmos', 'fantom', 'filecoin',
  'arbitrum', 'optimism', 'injective-protocol', 'immutable-x', 'theta-token',
  'sei-network', 'celestia', 'bonk', 'floki', 'jupiter-exchange-solana',
  'ondo-finance', 'fetch-ai', 'worldcoin-wld', 'pyth-network', 'bittensor',
  'the-open-network', 'dai', 'maker', 'the-graph', 'thorchain', 'lido-dao',
  'gala', 'the-sandbox', 'decentraland', 'axie-infinity', 'flow', 'tezos',
  'eos', 'neo', 'kava', 'conflux-token', 'iota', 'pancakeswap-token', 'dydx',
  'rocket-pool', 'blur', 'curve-dao-token', 'ethereum-name-service', 'gmx',
  'mina-protocol', 'apecoin', 'chiliz', '1inch', 'zilliqa', 'enjincoin',
  'basic-attention-token', 'loopring', '0x', 'ankr', 'celo', 'storj',
  'ocean-protocol', 'dogwifcoin', 'mantle', 'okb', 'crypto-com-chain',
];

/** Fetch real quotes. Empty `quotes` means "no live data" — never mock values. */
export async function fetchLiveMarket(): Promise<FeedResult> {
  const fetchedAt = new Date().toISOString();

  // Primary: CoinGecko markets (one request, real 1h/24h/7d changes).
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url =
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd` +
        `&ids=${COINGECKO_IDS.join(',')}&order=market_cap_desc&sparkline=false` +
        `&price_change_percentage=1h,24h,7d&per_page=100`;
      const res = await fetch(url);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      if (!res.ok) break;
      const data = await res.json();
      const quotes: FeedQuote[] = (data as any[])
        .filter((c) => Number(c?.current_price) > 0)
        .map((c) => ({
          symbol: String(c.symbol).toUpperCase(),
          price: Number(c.current_price),
          change1h: Number(c.price_change_percentage_1h_in_currency ?? 0),
          change24h: Number(c.price_change_percentage_24h ?? 0),
          change7d: Number(c.price_change_percentage_7d_in_currency ?? 0),
          volume: Number(c.total_volume ?? 0),
          high24h: Number(c.high_24h ?? c.current_price),
          low24h: Number(c.low_24h ?? c.current_price),
        }));
      if (quotes.length > 0) return { quotes, source: 'coingecko', fetchedAt };
    } catch (_e) {
      // fall through to next attempt / fallback
    }
  }

  // First fallback: Coinbase's public product feed. This is the same venue the
  // trading engine executes against, and is substantially more reliable than
  // relying on a second aggregator. Enrich the most liquid names with actual
  // hourly candles so missing short-window data is never represented as 0%.
  try {
    const res = await fetch('https://api.coinbase.com/api/v3/brokerage/market/products?limit=500', {
      headers: { 'User-Agent': 'TitanAI-Market-Watcher/1.0' },
    });
    if (res.ok) {
      const body = await res.json();
      const products = Array.isArray(body?.products) ? body.products : [];
      const candidates = products
        .filter((p: any) => {
          const quote = String(p?.quote_currency_id ?? '').toUpperCase();
          const price = Number(p?.price ?? p?.mid_market_price ?? 0);
          return (quote === 'USDC' || quote === 'USD') && price > 0
            && p?.status === 'online' && !p?.is_disabled && !p?.trading_disabled
            && !p?.cancel_only && !p?.view_only && p?.product_type !== 'FUTURE';
        })
        .map((p: any) => {
          const price = Number(p.price ?? p.mid_market_price);
          return {
            productId: String(p.product_id),
            quote: {
              symbol: String(p.base_currency_id).toUpperCase(),
              price,
              change1h: Number.NaN,
              change24h: Number(p.price_percentage_change_24h ?? 0),
              change7d: 0,
              volume: Number(p.approximate_quote_24h_volume ?? 0),
              high24h: Number(p.high_24h ?? price),
              low24h: Number(p.low_24h ?? price),
            } satisfies FeedQuote,
          };
        })
        .sort((a: any, b: any) => b.quote.volume - a.quote.volume);

      const liquid = candidates.slice(0, 60);
      const now = Math.floor(Date.now() / 1000);
      let cursor = 0;
      const workers = Array.from({ length: Math.min(6, liquid.length) }, async () => {
        while (cursor < liquid.length) {
          const index = cursor++;
          const item = liquid[index];
          try {
            const candleRes = await fetch(
              `https://api.coinbase.com/api/v3/brokerage/market/products/${encodeURIComponent(item.productId)}/candles?start=${now - 3 * 3600}&end=${now}&granularity=ONE_HOUR`,
              { headers: { 'User-Agent': 'TitanAI-Market-Watcher/1.0' } },
            );
            if (!candleRes.ok) continue;
            const candleBody = await candleRes.json();
            const candles = Array.isArray(candleBody?.candles)
              ? [...candleBody.candles].sort((a: any, b: any) => Number(a.start) - Number(b.start))
              : [];
            if (candles.length < 2) continue;
            const previous = Number(candles[candles.length - 2]?.close ?? 0);
            const latest = Number(candles[candles.length - 1]?.close ?? 0);
            if (previous > 0 && latest > 0) item.quote.change1h = ((latest - previous) / previous) * 100;
          } catch (_e) {
            // This asset is omitted below rather than publishing a fake flat move.
          }
        }
      });
      await Promise.all(workers);

      const quotes = liquid.map((item: any) => item.quote)
        .filter((q: FeedQuote) => Number.isFinite(q.change1h));
      if (quotes.length >= 8) return { quotes, source: 'coinbase', fetchedAt };
    }
  } catch (_e) {
    // fall through to the final fallback
  }

  // Final fallback: CoinCap (real prices, 24h change only). Keep the feed live,
  // but mark the missing hourly move as NaN so it cannot masquerade as flat data.
  try {
    const res = await fetch('https://api.coincap.io/v2/assets?limit=100');
    if (res.ok) {
      const { data } = await res.json();
      const quotes: FeedQuote[] = (data as any[])
        .filter((c) => Number(c?.priceUsd) > 0)
        .map((c) => {
          const price = Number(c.priceUsd);
          return {
            symbol: String(c.symbol).toUpperCase(),
            price,
            change1h: Number.NaN,
            change24h: Number(c.changePercent24Hr ?? 0),
            change7d: 0,
            volume: Number(c.volumeUsd24Hr ?? 0),
            high24h: price,
            low24h: price,
          };
        });
      const usable = quotes.filter((q) => Number.isFinite(q.change1h));
      if (usable.length > 0) return { quotes: usable, source: 'coincap', fetchedAt };
    }
  } catch (_e) {
    // fall through
  }

  return { quotes: [], source: 'none', fetchedAt };
}

export type RegimeProfile = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'dead';

export interface RegimeScore {
  enumRegime: 'trending' | 'ranging' | 'high_volatility' | 'low_volatility' | 'news_driven';
  profile: RegimeProfile;
  /** Mean |change| since the previous snapshot (real price delta, not modeled). */
  avgShortAbs: number;
  avg1hAbs: number;
  avg24h: number;
  dispersion24h: number;
  risersShare: number;
  sampleSize: number;
  /** True when the classification is backed by live quotes. */
  live: boolean;
}

const DEAD_REGIME: RegimeScore = {
  enumRegime: 'ranging',
  profile: 'dead',
  avgShortAbs: 0,
  avg1hAbs: 0,
  avg24h: 0,
  dispersion24h: 0,
  risersShare: 0,
  sampleSize: 0,
  live: false,
};

/**
 * Score the market regime from real quotes. `prevPrices` (last cycle's snapshot)
 * yields a genuine short-window change; without it we lean on the 1h/24h feed values.
 */
export function scoreRegime(
  quotes: FeedQuote[],
  prevPrices?: Record<string, number> | null,
): RegimeScore {
  if (quotes.length === 0) return { ...DEAD_REGIME };

  const c24 = quotes.map((q) => q.change24h);
  const avg24h = mean(c24);
  const dispersion24h = Math.sqrt(mean(c24.map((x) => (x - avg24h) ** 2)));
  const avg1hAbs = mean(quotes.map((q) => Math.abs(q.change1h)));

  const shortDeltas: number[] = [];
  let risers = 0;
  for (const q of quotes) {
    const prev = prevPrices?.[q.symbol];
    if (prev && prev > 0) {
      const pct = ((q.price - prev) / prev) * 100;
      shortDeltas.push(pct);
      if (pct > 0) risers++;
    }
  }
  const avgShortAbs = shortDeltas.length ? mean(shortDeltas.map(Math.abs)) : avg1hAbs;
  const risersShare = shortDeltas.length
    ? risers / shortDeltas.length
    : quotes.filter((q) => q.change1h > 0).length / quotes.length;

  // Enum regime (DB-facing) from real dispersion / drift.
  let enumRegime: RegimeScore['enumRegime'];
  if (dispersion24h > 8) enumRegime = 'high_volatility';
  else if (dispersion24h < 2) enumRegime = 'low_volatility';
  else if (Math.abs(avg24h) > 3) enumRegime = 'trending';
  else enumRegime = 'ranging';

  // Policy-facing profile.
  let profile: RegimeProfile;
  if (avgShortAbs < 0.15 && avg1hAbs < 0.4 && dispersion24h < 1.5) profile = 'dead';
  else if (dispersion24h > 8 || avgShortAbs > 1.5) profile = 'volatile';
  else if (avg24h > 2 && risersShare > 0.55) profile = 'trending_up';
  else if (avg24h < -2 && risersShare < 0.45) profile = 'trending_down';
  else profile = 'ranging';

  return {
    enumRegime,
    profile,
    avgShortAbs: round(avgShortAbs),
    avg1hAbs: round(avg1hAbs),
    avg24h: round(avg24h),
    dispersion24h: round(dispersion24h),
    risersShare: round(risersShare),
    sampleSize: quotes.length,
    live: true,
  };
}

/** Compact snapshot of real prices to carry into the next cycle. */
export function priceSnapshot(quotes: FeedQuote[], limit = 100): Record<string, number> {
  const out: Record<string, number> = {};
  for (const q of quotes.slice(0, limit)) out[q.symbol] = q.price;
  return out;
}

export function quoteMap(quotes: FeedQuote[]): Record<string, FeedQuote> {
  const out: Record<string, FeedQuote> = {};
  for (const q of quotes) out[q.symbol] = q;
  return out;
}

/** Normalize a stored position symbol (BTC-USD, BTCUSDC, BTC/USD) to its base asset. */
export function baseAsset(symbol: string): string {
  return String(symbol)
    .toUpperCase()
    .replace(/[-/]/g, '')
    .replace(/(USDC|USDT|USD)$/, '') || String(symbol).toUpperCase();
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

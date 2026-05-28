/**
 * Live spot prices from Coinbase Exchange's public API.
 *
 * Why Coinbase over CoinGecko for the dashboard / position prices:
 *   - Free, no API key, ~10 req/sec public limit
 *   - Real-time (CoinGecko free tier caches ~60s)
 *   - Prices match exactly what our live trades execute at on Coinbase
 *
 * Endpoint: https://api.exchange.coinbase.com/products/{SYMBOL}-USD/ticker
 *   Returns: { price, size, time, bid, ask, volume }
 *
 * There's no batch endpoint, so we fan-out parallel fetches per symbol.
 * For typical position counts (< 20) this is fast and well within limits.
 */

const COINBASE_BASE = 'https://api.exchange.coinbase.com';

// Symbols Coinbase doesn't list / non-USD-quoted only (skip to save a 404 round-trip)
const COINBASE_UNAVAILABLE = new Set<string>([
  // populated lazily as we discover 404s in-session
]);

const inFlight = new Map<string, Promise<number | null>>();

async function fetchOneTicker(symbol: string): Promise<number | null> {
  const sym = symbol.toUpperCase();
  if (COINBASE_UNAVAILABLE.has(sym)) return null;

  // Coalesce concurrent requests for the same symbol within one tick
  const existing = inFlight.get(sym);
  if (existing) return existing;

  const p = (async () => {
    try {
      // Try -USD first, then -USDC (Coinbase migrated many USD pairs to USDC)
      for (const quote of ['USD', 'USDC']) {
        const res = await fetch(`${COINBASE_BASE}/products/${sym}-${quote}/ticker`);
        if (res.ok) {
          const data = await res.json();
          const price = Number(data?.price);
          if (price > 0) return price;
        } else if (res.status === 404 && quote === 'USDC') {
          // Both pairs missing — mark unavailable so we don't keep hammering
          COINBASE_UNAVAILABLE.add(sym);
        }
      }
    } catch (err) {
      console.warn(`[Coinbase] ticker fetch failed for ${sym}:`, err);
    }
    return null;
  })();

  inFlight.set(sym, p);
  try {
    return await p;
  } finally {
    // Short-lived dedupe — release once resolved
    setTimeout(() => inFlight.delete(sym), 250);
  }
}

/**
 * Fetch live USD prices for a list of symbols from Coinbase.
 * Returns { SYMBOL: price } only for symbols Coinbase has a live tick for.
 * Symbols not on Coinbase are simply absent — caller should fall back.
 */
export async function fetchCoinbasePrices(
  symbols: string[]
): Promise<Record<string, number>> {
  const unique = [...new Set(symbols.map(s => s.toUpperCase()))];
  const results = await Promise.all(
    unique.map(async sym => [sym, await fetchOneTicker(sym)] as const)
  );
  const out: Record<string, number> = {};
  for (const [sym, price] of results) {
    if (price !== null) out[sym] = price;
  }
  return out;
}

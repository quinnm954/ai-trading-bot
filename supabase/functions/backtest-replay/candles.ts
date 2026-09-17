// Historical candle acquisition + cache access.
//
// Coinbase returns at most 350 candles per request, so 90 days of 5-minute bars is
// ~75 paginated calls per market. That is far too slow to redo on every run, so bars
// are cached in `backtest_candles` once and every later replay reads from the cache.

export type Granularity = 'FIVE_MINUTE' | 'ONE_HOUR';

export const GRANULARITY_SECONDS: Record<Granularity, number> = {
  FIVE_MINUTE: 300,
  ONE_HOUR: 3600,
};

/** Coinbase hard cap on candles per response. */
const MAX_CANDLES_PER_REQUEST = 300;

export interface Bar {
  start: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, attempts = 5): Promise<Response | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'TitanAI-Backtest/1.0' } });
      if (resp.ok) return resp;
      if (resp.status === 429 || resp.status >= 500) {
        await resp.body?.cancel().catch(() => {});
        await sleep(300 * 2 ** i + Math.random() * 250);
        continue;
      }
      await resp.body?.cancel().catch(() => {});
      return null;
    } catch (_e) {
      await sleep(300 * 2 ** i);
    }
  }
  return null;
}

/** The tradable USDC/USD spot universe, most liquid first — same filter the engine uses. */
export async function fetchUniverse(size: number): Promise<{ symbol: string; productId: string; volume: number }[]> {
  const STABLES = ['USDT', 'USDC', 'DAI', 'USDS', 'PYUSD', 'FDUSD', 'TUSD', 'USDP', 'EURC', 'GUSD', 'RLUSD'];
  const resp = await fetchWithRetry('https://api.coinbase.com/api/v3/brokerage/market/products?limit=500');
  if (!resp) throw new Error('Coinbase product list unavailable');
  const body = await resp.json();
  const products = Array.isArray(body?.products) ? body.products : [];
  return products
    .filter((p: Record<string, unknown>) => {
      const quote = String(p?.quote_currency_id ?? '').toUpperCase();
      const base = String(p?.base_currency_id ?? '').toUpperCase();
      const price = Number(p?.price ?? p?.mid_market_price ?? 0);
      return (quote === 'USDC' || quote === 'USD')
        && price > 0
        && p?.status === 'online'
        && !p?.is_disabled && !p?.trading_disabled && !p?.cancel_only && !p?.view_only
        && p?.product_type !== 'FUTURE'
        && !STABLES.includes(base);
    })
    .map((p: Record<string, unknown>) => ({
      symbol: String(p.base_currency_id).toUpperCase(),
      productId: String(p.product_id),
      volume: Number(p.approximate_quote_24h_volume ?? 0),
    }))
    .sort((a: { volume: number }, b: { volume: number }) => b.volume - a.volume)
    // ONE PRODUCT PER COIN. Coinbase lists BTC-USD and BTC-USDC separately, so an
    // undeduped top-N was really N/2 coins counted twice — and because results are
    // keyed by base symbol, the second product silently overwrote the first row.
    .filter((p: { symbol: string }, _i: number, arr: { symbol: string }[]) =>
      arr.findIndex((q) => q.symbol === p.symbol) === _i)
    .slice(0, size);
}

/** Page through Coinbase history for one market/granularity and return every bar. */
export async function fetchHistory(
  productId: string,
  granularity: Granularity,
  startSec: number,
  endSec: number,
): Promise<Bar[]> {
  const step = GRANULARITY_SECONDS[granularity];
  const span = step * MAX_CANDLES_PER_REQUEST;
  const seen = new Map<number, Bar>();

  for (let from = startSec; from < endSec; from += span) {
    const to = Math.min(from + span, endSec);
    const url = `https://api.coinbase.com/api/v3/brokerage/market/products/${encodeURIComponent(productId)}/candles`
      + `?start=${from}&end=${to}&granularity=${granularity}`;
    const resp = await fetchWithRetry(url);
    if (!resp) continue;
    const data = await resp.json().catch(() => null);
    const raw = Array.isArray(data?.candles) ? data.candles : [];
    for (const c of raw) {
      const bar: Bar = {
        start: Number(c.start),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume) || 0,
      };
      if (Number.isFinite(bar.start) && bar.close > 0) seen.set(bar.start, bar);
    }
  }

  return [...seen.values()].sort((a, b) => a.start - b.start);
}

/** Persist bars to the shared cache in chunks. */
// deno-lint-ignore no-explicit-any
export async function cacheBars(supabase: any, productId: string, granularity: Granularity, bars: Bar[]): Promise<number> {
  let written = 0;
  const CHUNK = 1000;
  for (let i = 0; i < bars.length; i += CHUNK) {
    const rows = bars.slice(i, i + CHUNK).map((b) => ({
      product_id: productId,
      granularity,
      bucket_start: b.start,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
    const { error } = await supabase
      .from('backtest_candles')
      .upsert(rows, { onConflict: 'product_id,granularity,bucket_start', ignoreDuplicates: true });
    if (error) throw new Error(`cache write failed: ${error.message}`);
    written += rows.length;
  }
  return written;
}

/** Read the cached series back, ascending. */
// deno-lint-ignore no-explicit-any
export async function loadBars(
  supabase: any,
  productId: string,
  granularity: Granularity,
  startSec: number,
  endSec: number,
): Promise<Bar[]> {
  const out: Bar[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('backtest_candles')
      .select('bucket_start, open, high, low, close, volume')
      .eq('product_id', productId)
      .eq('granularity', granularity)
      .gte('bucket_start', startSec)
      .lte('bucket_start', endSec)
      .order('bucket_start', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`cache read failed: ${error.message}`);
    const rows = data ?? [];
    for (const r of rows) {
      out.push({
        start: Number(r.bucket_start),
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

/** How many bars are already cached for this market/granularity in range. */
// deno-lint-ignore no-explicit-any
export async function cachedCount(
  supabase: any,
  productId: string,
  granularity: Granularity,
  startSec: number,
  endSec: number,
): Promise<number> {
  const { count, error } = await supabase
    .from('backtest_candles')
    .select('bucket_start', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('granularity', granularity)
    .gte('bucket_start', startSec)
    .lte('bucket_start', endSec);
  if (error) throw new Error(`cache count failed: ${error.message}`);
  return Number(count ?? 0);
}

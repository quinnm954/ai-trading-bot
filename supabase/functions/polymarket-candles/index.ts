import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Polymarket CLOB price history endpoint (public, no auth)
// Docs: https://docs.polymarket.com/#timeseries-data
const CLOB = 'https://clob.polymarket.com';

interface PricePoint { t: number; p: number }
interface Candle { t: number; open: number; high: number; low: number; close: number }

function aggregateCandles(points: PricePoint[], bucketSec: number): Candle[] {
  if (!points.length) return [];
  const buckets = new Map<number, PricePoint[]>();
  for (const pt of points) {
    const bucket = Math.floor(pt.t / bucketSec) * bucketSec;
    const arr = buckets.get(bucket) ?? [];
    arr.push(pt);
    buckets.set(bucket, arr);
  }
  const out: Candle[] = [];
  const keys = [...buckets.keys()].sort((a, b) => a - b);
  for (const k of keys) {
    const arr = buckets.get(k)!.sort((a, b) => a.t - b.t);
    const prices = arr.map(p => p.p);
    out.push({
      t: k,
      open: arr[0].p,
      close: arr[arr.length - 1].p,
      high: Math.max(...prices),
      low: Math.min(...prices),
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tokenId = url.searchParams.get('token_id');
    const fidelityRaw = url.searchParams.get('fidelity') ?? '5'; // minutes per candle
    const interval = url.searchParams.get('interval') ?? '1d'; // 1h, 6h, 1d, 1w, 1m, max

    if (!tokenId) {
      return new Response(JSON.stringify({ error: 'token_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const fidelity = Math.max(1, parseInt(fidelityRaw, 10) || 5);
    if (![5, 15].includes(fidelity)) {
      return new Response(JSON.stringify({ error: 'fidelity must be 5 or 15' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const histUrl = new URL(`${CLOB}/prices-history`);
    histUrl.searchParams.set('market', tokenId);
    histUrl.searchParams.set('interval', interval);
    histUrl.searchParams.set('fidelity', String(fidelity));

    const res = await fetch(histUrl.toString(), { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`CLOB error [${res.status}]: ${body.slice(0, 200)}`);
    }
    const data = await res.json() as { history?: PricePoint[] };
    const points = data.history ?? [];
    const candles = aggregateCandles(points, fidelity * 60);

    return new Response(
      JSON.stringify({ token_id: tokenId, fidelity, interval, candles, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('polymarket-candles error:', message);
    return new Response(
      JSON.stringify({ error: message, candles: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

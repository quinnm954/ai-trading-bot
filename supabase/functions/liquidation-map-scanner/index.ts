// Liquidation-map scanner — aggregates per-symbol liquidation clusters.
// Internal mode: bucket implied liq prices from open positions + futures_positions.
// External mode: optional, gated by LIQUIDATION_API_KEY (Coinglass-style endpoint).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LIQUIDATION_API_KEY = Deno.env.get('LIQUIDATION_API_KEY') || '';

interface Cluster {
  symbol: string;
  price_level: number;
  side: 'long' | 'short';
  cluster_size_usd: number;
  position_count: number;
  source: 'internal' | 'external';
}

function bucketPrice(price: number, binPct = 0.005): number {
  // 0.5% bins by default
  const log = Math.log10(price);
  const magnitude = Math.pow(10, Math.floor(log) - 1);
  const step = Math.max(price * binPct, magnitude);
  return Math.round(price / step) * step;
}

async function aggregateInternal(supabase: any): Promise<Cluster[]> {
  const buckets = new Map<string, Cluster>();

  // Futures positions carry leverage + estimated_liquidation_price natively
  const { data: fut } = await supabase
    .from('futures_positions')
    .select('symbol, side, position_value, estimated_liquidation_price')
    .eq('status', 'open')
    .not('estimated_liquidation_price', 'is', null);

  for (const p of fut || []) {
    if (!p.estimated_liquidation_price || !p.position_value) continue;
    const level = bucketPrice(Number(p.estimated_liquidation_price));
    const key = `${p.symbol}|${p.side}|${level}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.cluster_size_usd += Number(p.position_value);
      existing.position_count += 1;
    } else {
      buckets.set(key, {
        symbol: p.symbol,
        price_level: level,
        side: p.side === 'long' ? 'long' : 'short',
        cluster_size_usd: Number(p.position_value),
        position_count: 1,
        source: 'internal',
      });
    }
  }

  // Spot positions: implied liquidation = entry × (1 - 1/leverage) — assume 1x if no leverage.
  // Skip 1x spot (no real liquidation pressure); only useful when leverage is known.
  return Array.from(buckets.values());
}

async function fetchExternal(symbols: string[]): Promise<Cluster[]> {
  if (!LIQUIDATION_API_KEY || symbols.length === 0) return [];
  // Placeholder — wire to your provider of choice (e.g. Coinglass).
  // Returning [] keeps the function safe when no provider is configured.
  return [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const internal = await aggregateInternal(supabase);

    const symbols = [...new Set(internal.map(c => c.symbol))];
    const external = await fetchExternal(symbols);

    const all = [...internal, ...external];

    // Clear stale rows (older than 1h) then upsert fresh aggregates
    await supabase.from('liquidation_map').delete().lt('updated_at', new Date(Date.now() - 3600_000).toISOString());

    if (all.length > 0) {
      // Insert as a new snapshot (don't upsert on PK since each cycle replaces)
      const rows = all.map(c => ({ ...c, updated_at: new Date().toISOString() }));
      await supabase.from('liquidation_map').insert(rows);
    }

    return new Response(
      JSON.stringify({
        success: true,
        clusters: all.length,
        symbols: symbols.length,
        sources: { internal: internal.length, external: external.length, externalEnabled: !!LIQUIDATION_API_KEY },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('liquidation-map-scanner error', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

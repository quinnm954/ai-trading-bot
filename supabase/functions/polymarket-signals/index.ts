import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Public Polymarket Gamma API — no auth required
const GAMMA = 'https://gamma-api.polymarket.com';

// Keywords to filter crypto-related markets
const CRYPTO_KEYWORDS = [
  'bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol',
  'crypto', 'coinbase', 'binance', 'etf', 'spot etf',
  'dogecoin', 'doge', 'xrp', 'ripple', 'sec', 'stablecoin',
  'altcoin', 'memecoin', 'defi', 'token'
];

interface PolyMarket {
  id: string;
  question: string;
  slug: string;
  outcomes: string; // JSON array string
  outcomePrices: string; // JSON array string of price strings
  volume?: string;
  liquidity?: string;
  endDate?: string;
  active?: boolean;
  closed?: boolean;
  category?: string;
}

interface PolyEvent {
  id: string;
  title: string;
  slug: string;
  category?: string;
  volume?: number;
  liquidity?: number;
  endDate?: string;
  markets?: PolyMarket[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Pull active, non-closed events sorted by volume; broad query then filter to crypto
    const url = new URL(`${GAMMA}/events`);
    url.searchParams.set('active', 'true');
    url.searchParams.set('closed', 'false');
    url.searchParams.set('limit', '200');
    url.searchParams.set('order', 'volume24hr');
    url.searchParams.set('ascending', 'false');

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Polymarket Gamma error [${res.status}]: ${body.slice(0, 200)}`);
    }

    const events: PolyEvent[] = await res.json();

    const cryptoEvents = events.filter((e) => {
      const hay = `${e.title ?? ''} ${e.category ?? ''}`.toLowerCase();
      return CRYPTO_KEYWORDS.some((k) => hay.includes(k));
    });

    const signals = cryptoEvents.flatMap((e) => {
      const markets = e.markets ?? [];
      return markets
        .filter((m) => m.active !== false && m.closed !== true)
        .map((m) => {
          let outcomes: string[] = [];
          let prices: number[] = [];
          try {
            outcomes = JSON.parse(m.outcomes ?? '[]');
            prices = JSON.parse(m.outcomePrices ?? '[]').map((p: string) => Number(p));
          } catch (_) { /* ignore parse errors */ }

          const yesIdx = outcomes.findIndex((o) => o?.toLowerCase() === 'yes');
          const yesProb = yesIdx >= 0 ? prices[yesIdx] : prices[0] ?? null;

          return {
            event_id: e.id,
            event_title: e.title,
            market_id: m.id,
            question: m.question,
            slug: m.slug ?? e.slug,
            outcomes,
            prices,
            yes_probability: yesProb,
            volume: Number(m.volume ?? e.volume ?? 0),
            liquidity: Number(m.liquidity ?? e.liquidity ?? 0),
            end_date: m.endDate ?? e.endDate ?? null,
            url: `https://polymarket.com/event/${e.slug}`,
          };
        });
    });

    // Rank by liquidity desc then volume desc, top 30
    signals.sort((a, b) => (b.liquidity - a.liquidity) || (b.volume - a.volume));
    const top = signals.slice(0, 30);

    return new Response(
      JSON.stringify({ signals: top, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('polymarket-signals error:', message);
    return new Response(
      JSON.stringify({ error: message, signals: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

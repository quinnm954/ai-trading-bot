import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GAMMA = 'https://gamma-api.polymarket.com';
const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const CRYPTO_KEYWORDS = [
  'bitcoin','btc','ethereum','eth','solana','sol','crypto','coinbase','binance',
  'etf','spot etf','dogecoin','doge','xrp','ripple','sec','stablecoin',
  'altcoin','memecoin','defi','token','blackrock','grayscale','halving'
];

const SYMBOL_MAP: Record<string, string[]> = {
  bitcoin: ['BTC'], btc: ['BTC'],
  ethereum: ['ETH'], eth: ['ETH'],
  solana: ['SOL'], sol: ['SOL'],
  xrp: ['XRP'], ripple: ['XRP'],
  doge: ['DOGE'], dogecoin: ['DOGE'],
};

function extractSymbols(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const [kw, syms] of Object.entries(SYMBOL_MAP)) {
    if (lower.includes(kw)) syms.forEach((s) => found.add(s));
  }
  return [...found];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Pull active crypto events with upcoming end dates (next 60d)
    const url = new URL(`${GAMMA}/events`);
    url.searchParams.set('active', 'true');
    url.searchParams.set('closed', 'false');
    url.searchParams.set('limit', '200');
    url.searchParams.set('order', 'volume24hr');
    url.searchParams.set('ascending', 'false');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Gamma error ${res.status}`);
    const events: any[] = await res.json();

    const cryptoMarkets: any[] = [];
    for (const e of events) {
      const hay = `${e.title ?? ''} ${e.category ?? ''}`.toLowerCase();
      if (!CRYPTO_KEYWORDS.some((k) => hay.includes(k))) continue;
      for (const m of e.markets ?? []) {
        if (m.closed || m.active === false) continue;
        cryptoMarkets.push({ event: e, market: m });
      }
    }

    // Sort by liquidity, take top 15 to keep AI cost bounded
    cryptoMarkets.sort((a, b) =>
      Number(b.market.liquidity ?? 0) - Number(a.market.liquidity ?? 0)
    );
    const top = cryptoMarkets.slice(0, 15);

    const scored = [];
    for (const { event, market } of top) {
      let outcomes: string[] = [];
      let prices: number[] = [];
      try {
        outcomes = JSON.parse(market.outcomes ?? '[]');
        prices = JSON.parse(market.outcomePrices ?? '[]').map(Number);
      } catch { /* ignore */ }
      const yesIdx = outcomes.findIndex((o) => o?.toLowerCase() === 'yes');
      const yesProb = yesIdx >= 0 ? prices[yesIdx] : prices[0] ?? null;
      const symbols = extractSymbols(`${event.title} ${market.question}`);

      // AI scoring
      const aiResp = await fetch(AI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3.5-flash',
          messages: [
            { role: 'system', content: 'You are a crypto market analyst. Given a Polymarket prediction market, output a conviction score and likely directional bias for spot crypto prices if this market resolves YES.' },
            { role: 'user', content: `Market: "${market.question}"\nEvent: "${event.title}"\nYES probability: ${yesProb != null ? (yesProb * 100).toFixed(1) + '%' : 'unknown'}\nResolves: ${market.endDate ?? event.endDate ?? 'unknown'}\nRelated symbols: ${symbols.join(', ') || 'none detected'}\n\nReturn JSON only with keys: conviction (0-100 integer, how strongly this should influence a trade), direction (bullish|bearish|neutral for the related crypto), rationale (one sentence). No prose outside JSON.` },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiResp.ok) {
        console.error('AI score failed', market.id, aiResp.status);
        continue;
      }
      const ai = await aiResp.json();
      let parsed: any = {};
      try {
        parsed = JSON.parse(ai.choices?.[0]?.message?.content ?? '{}');
      } catch { continue; }

      const conviction = Math.max(0, Math.min(100, Math.round(Number(parsed.conviction) || 0)));
      const direction = ['bullish','bearish','neutral'].includes(parsed.direction) ? parsed.direction : 'neutral';

      scored.push({
        market_id: String(market.id),
        event_id: String(event.id),
        question: market.question,
        symbols,
        conviction,
        direction,
        rationale: String(parsed.rationale ?? '').slice(0, 500),
        yes_probability: yesProb,
        volume: Number(market.volume ?? event.volume ?? 0),
        end_date: market.endDate ?? event.endDate ?? null,
        url: `https://polymarket.com/event/${event.slug}`,
        scored_at: new Date().toISOString(),
      });
    }

    if (scored.length > 0) {
      const { error } = await supabase
        .from('polymarket_event_scores')
        .upsert(scored, { onConflict: 'market_id' });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ scored: scored.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('polymarket-ai-score error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

// Top symbols we fuse — keep small to bound AI cost
const SYMBOLS = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE'];

interface Feature {
  polymarket: { conviction: number; direction: string; rationale?: string }[];
  news: { sentiment_avg: number; count: number; headlines: string[] };
  liquidation: { nearest_cluster_pct?: number; side?: string; cluster_usd?: number };
  technicals: { regime?: string; vol_pct?: number };
  volume: { rank?: number; change_24h?: number };
}

async function gatherFeatures(supabase: any, symbol: string): Promise<Feature> {
  const [pmRes, newsRes, liqRes, regimeRes, marketRes] = await Promise.all([
    supabase
      .from('polymarket_event_scores')
      .select('conviction, direction, rationale')
      .contains('symbols', [symbol])
      .gt('scored_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('conviction', { ascending: false })
      .limit(5),
    supabase
      .from('news_feed')
      .select('title, sentiment')
      .contains('symbols', [symbol])
      .gt('published_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('published_at', { ascending: false })
      .limit(10),
    supabase
      .from('liquidation_map')
      .select('price_level, side, cluster_size_usd')
      .ilike('symbol', `${symbol}%`)
      .order('cluster_size_usd', { ascending: false })
      .limit(3),
    supabase
      .from('ai_settings')
      .select('current_regime')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('market_data_cache')
      .select('price_change_24h, volume_24h')
      .ilike('symbol', `${symbol}%`)
      .limit(1)
      .maybeSingle(),
  ]);

  const news = newsRes.data ?? [];
  const sentimentAvg = news.length > 0
    ? news.reduce((s: number, n: any) => s + Number(n.sentiment || 0), 0) / news.length
    : 0;

  const liq = (liqRes.data ?? [])[0];

  return {
    polymarket: (pmRes.data ?? []) as any,
    news: {
      sentiment_avg: Number(sentimentAvg.toFixed(3)),
      count: news.length,
      headlines: news.slice(0, 5).map((n: any) => n.title),
    },
    liquidation: liq
      ? {
          nearest_cluster_pct: undefined,
          side: liq.side,
          cluster_usd: Number(liq.cluster_size_usd),
        }
      : {},
    technicals: { regime: regimeRes.data?.current_regime ?? 'unknown' },
    volume: {
      change_24h: Number(marketRes.data?.price_change_24h ?? 0),
    },
  };
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

    const results = [];
    for (const symbol of SYMBOLS) {
      const features = await gatherFeatures(supabase, symbol);

      const aiResp = await fetch(AI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-3.5-flash',
          messages: [
            { role: 'system', content: 'You are Titan AI, a crypto market intelligence fusion engine. Combine all input signals into a single conviction call. Be conservative — capital preservation is the priority. Only output JSON.' },
            { role: 'user', content: `Symbol: ${symbol}\n\nSignals:\n${JSON.stringify(features, null, 2)}\n\nReturn JSON with: conviction (0-100), direction (bullish|bearish|neutral), horizon (short|medium|long), drivers (array of 2-4 short phrases), rationale (one sentence). No other text.` },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!aiResp.ok) {
        const txt = await aiResp.text();
        console.error(`AI fusion ${symbol} failed:`, aiResp.status, txt.slice(0, 200));
        if (aiResp.status === 429 || aiResp.status === 402) {
          return new Response(JSON.stringify({ error: aiResp.status === 429 ? 'rate_limited' : 'payment_required' }), {
            status: aiResp.status,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        continue;
      }

      const ai = await aiResp.json();
      let parsed: any = {};
      try { parsed = JSON.parse(ai.choices?.[0]?.message?.content ?? '{}'); } catch { continue; }

      const conviction = Math.max(0, Math.min(100, Math.round(Number(parsed.conviction) || 0)));
      const direction = ['bullish','bearish','neutral'].includes(parsed.direction) ? parsed.direction : 'neutral';
      const horizon = ['short','medium','long'].includes(parsed.horizon) ? parsed.horizon : 'short';
      const drivers = Array.isArray(parsed.drivers) ? parsed.drivers.slice(0, 4).map((d: any) => String(d).slice(0, 80)) : [];

      const row = {
        symbol,
        conviction,
        direction,
        horizon,
        drivers,
        rationale: String(parsed.rationale ?? '').slice(0, 500),
        features,
      };

      const { error } = await supabase.from('titan_fusion_signals').insert(row);
      if (error) console.error('insert error', error);
      results.push(row);
    }

    return new Response(JSON.stringify({ generated: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('titan-fusion-engine error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

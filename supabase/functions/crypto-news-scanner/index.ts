import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Free public RSS feeds — no API key required
const FEEDS = [
  { source: 'CoinDesk', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { source: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
  { source: 'Decrypt', url: 'https://decrypt.co/feed' },
  { source: 'TheBlock', url: 'https://www.theblock.co/rss.xml' },
];

const SYMBOL_MAP: Record<string, string[]> = {
  bitcoin: ['BTC'], btc: ['BTC'],
  ethereum: ['ETH'], eth: ['ETH'], ether: ['ETH'],
  solana: ['SOL'], sol: ['SOL'],
  xrp: ['XRP'], ripple: ['XRP'],
  doge: ['DOGE'], dogecoin: ['DOGE'],
  avalanche: ['AVAX'], avax: ['AVAX'],
  cardano: ['ADA'], ada: ['ADA'],
  polygon: ['MATIC'], matic: ['MATIC'],
  chainlink: ['LINK'], link: ['LINK'],
};

const BULL = ['surge','soar','rally','rise','jump','high','bullish','approval','approved','adopt','partnership','breakout','pump','gain','positive','upgrade'];
const BEAR = ['crash','plunge','drop','fall','low','bearish','reject','rejected','hack','exploit','ban','lawsuit','sec','fud','dump','loss','negative','downgrade','liquidat'];

function extractSymbols(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  for (const [kw, syms] of Object.entries(SYMBOL_MAP)) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(lower)) syms.forEach((s) => found.add(s));
  }
  return [...found];
}

function scoreSentiment(text: string): number {
  const lower = text.toLowerCase();
  let s = 0;
  for (const w of BULL) if (lower.includes(w)) s += 1;
  for (const w of BEAR) if (lower.includes(w)) s -= 1;
  return Math.max(-1, Math.min(1, s / 5));
}

function parseRss(xml: string): Array<{ title: string; link: string; pubDate: string; description: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; description: string }> = [];
  const itemRe = /<item[\s\S]*?<\/item>/g;
  const matches = xml.match(itemRe) ?? [];
  for (const block of matches) {
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!m) return '';
      let v = m[1].trim();
      v = v.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      v = v.replace(/<[^>]+>/g, '');
      return v.trim();
    };
    const title = get('title');
    const link = get('link');
    const pubDate = get('pubDate') || get('dc:date') || new Date().toISOString();
    const description = get('description') || get('summary');
    if (title && link) items.push({ title, link, pubDate, description });
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const collected: any[] = [];
    for (const feed of FEEDS) {
      try {
        const r = await fetch(feed.url, {
          headers: { 'User-Agent': 'TitanAI/1.0', Accept: 'application/rss+xml,application/xml,text/xml' },
        });
        if (!r.ok) { console.warn(`feed ${feed.source} ${r.status}`); continue; }
        const xml = await r.text();
        const items = parseRss(xml).slice(0, 20);
        for (const it of items) {
          const symbols = extractSymbols(`${it.title} ${it.description}`);
          if (symbols.length === 0) continue; // skip non-crypto-tagged items
          collected.push({
            title: it.title.slice(0, 500),
            url: it.link,
            source: feed.source,
            summary: it.description.slice(0, 800),
            symbols,
            sentiment: scoreSentiment(`${it.title} ${it.description}`),
            published_at: new Date(it.pubDate).toISOString(),
          });
        }
      } catch (e) {
        console.warn(`feed ${feed.source} error`, e);
      }
    }

    if (collected.length > 0) {
      const { error } = await supabase
        .from('news_feed')
        .upsert(collected, { onConflict: 'url', ignoreDuplicates: true });
      if (error) console.error('upsert error', error);
    }

    return new Response(JSON.stringify({ ingested: collected.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('crypto-news-scanner error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

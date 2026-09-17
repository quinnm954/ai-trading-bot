// ── STOCK DATA PROVIDER ──────────────────────────────────────────────────────
// Equity quotes, historical bars, and the real trading calendar (holidays and
// early closes) for the stock side of the engine and the UI.
//
// Actions:
//   quotes    — live snapshot quotes for the scan universe
//   bars      — historical bars for one symbol
//   clock     — session state: open?, entries allowed?, minutes to close, next open
//   calendar  — trading days in a range
//   universe  — tradable symbols in the scan universe

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { getBars, getCalendar } from '../_shared/alpaca.ts';
import { loadDataCreds } from '../_shared/alpaca-creds.ts';
import { getSessionState } from '../_shared/market-hours.ts';
import { fetchStockMarket, resolveUniverse } from '../_shared/stock-feed.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: userData } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: 'Not authenticated' }, 401);

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const action = String(body.action ?? 'clock');

    const creds = await loadDataCreds(supabase, userId);
    if (!creds) {
      return json({
        error: 'no_alpaca_credentials',
        message: 'Connect an Alpaca account to use stock market data.',
      }, 400);
    }

    switch (action) {
      case 'clock': {
        const session = await getSessionState(creds);
        return json({ session });
      }

      case 'calendar': {
        const start = String(body.start ?? new Date().toISOString().slice(0, 10));
        const end = String(body.end ?? start);
        const days = await getCalendar(creds, start, end);
        return json({ days });
      }

      case 'universe': {
        const { symbols, names } = await resolveUniverse(creds);
        return json({ symbols, names });
      }

      case 'quotes': {
        const feed = await fetchStockMarket(creds, {
          limit: Number(body.limit) || undefined,
          kinds: Array.isArray(body.kinds) && body.kinds.length > 0 ? body.kinds : undefined,
        });
        return json(feed);
      }


      case 'bars': {
        const symbol = String(body.symbol ?? '').toUpperCase();
        if (!symbol) return json({ error: 'symbol is required' }, 400);
        const timeframe = String(body.timeframe ?? '1Hour') as
          '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';
        const days = Math.min(Math.max(Number(body.days) || 30, 1), 365 * 2);
        const start = body.start
          ? String(body.start)
          : new Date(Date.now() - days * 86400_000).toISOString();
        const bars = await getBars(creds, symbol, timeframe, start, body.end ? String(body.end) : undefined);
        return json({ symbol, timeframe, bars, count: bars.length });
      }

      default:
        return json({ error: `unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error('stock-data-provider failed:', (e as Error).message);
    return json({ error: (e as Error).message }, 500);
  }
});

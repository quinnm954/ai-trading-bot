import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYMBOL_TO_COINGECKO: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'XRP': 'ripple',
  'DOGE': 'dogecoin', 'ADA': 'cardano', 'AVAX': 'avalanche-2', 'DOT': 'polkadot',
  'LINK': 'chainlink', 'LTC': 'litecoin', 'UNI': 'uniswap', 'ATOM': 'cosmos',
  'NEAR': 'near', 'APT': 'aptos', 'ARB': 'arbitrum', 'OP': 'optimism',
  'INJ': 'injective-protocol', 'TIA': 'celestia', 'SEI': 'sei-network',
  'SUI': 'sui', 'TON': 'the-open-network', 'ICP': 'internet-computer',
  'FIL': 'filecoin', 'RENDER': 'render-token', 'FET': 'fetch-ai', 'TAO': 'bittensor',
  'AAVE': 'aave', 'MKR': 'maker', 'GRT': 'the-graph', 'LDO': 'lido-dao',
  'CRV': 'curve-dao-token', 'IMX': 'immutable-x', 'STX': 'blockstack',
  'HBAR': 'hedera-hashgraph', 'XLM': 'stellar', 'ALGO': 'algorand',
  'VET': 'vechain', 'ETC': 'ethereum-classic', 'BCH': 'bitcoin-cash', 'TRX': 'tron',
  'SHIB': 'shiba-inu', 'PEPE': 'pepe', 'FLOKI': 'floki', 'BONK': 'bonk', 'WIF': 'dogwifcoin',
  'GALA': 'gala', 'SAND': 'the-sandbox', 'MANA': 'decentraland', 'AXS': 'axie-infinity',
  'ENJ': 'enjincoin', 'CHZ': 'chiliz', 'APE': 'apecoin',
  'CAKE': 'pancakeswap-token', 'COMP': 'compound-governance-token', 'SNX': 'havven',
  'DYDX': 'dydx', 'GMX': 'gmx', '1INCH': '1inch', 'BAT': 'basic-attention-token',
  'ZRX': '0x', 'LRC': 'loopring', 'ENS': 'ethereum-name-service', 'RPL': 'rocket-pool',
  'BLUR': 'blur', 'JUP': 'jupiter-exchange-solana', 'ONDO': 'ondo-finance',
  'PYTH': 'pyth-network', 'WLD': 'worldcoin-wld', 'THETA': 'theta-token',
  'FTM': 'fantom', 'RUNE': 'thorchain', 'KAVA': 'kava',
  'EOS': 'eos', 'NEO': 'neo', 'XTZ': 'tezos', 'QTUM': 'qtum', 'ICX': 'icon',
  'ZIL': 'zilliqa', 'ONE': 'harmony', 'CELO': 'celo', 'ANKR': 'ankr',
  'SKL': 'skale', 'STORJ': 'storj', 'OCEAN': 'ocean-protocol', 'MINA': 'mina-protocol',
  'EGLD': 'elrond-erd-2', 'FLOW': 'flow', 'CFX': 'conflux-token', 'IOTA': 'iota',
  'KAS': 'kaspa', 'MNT': 'mantle', 'CRO': 'crypto-com-chain', 'OKB': 'okb',
  'MATIC': 'matic-network', 'POL': 'polygon-ecosystem-token',
};

async function fetchLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const ids = symbols.map(s => SYMBOL_TO_COINGECKO[s.toUpperCase()]).filter(Boolean);
  if (ids.length === 0) return prices;

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
    );
    if (res.ok) {
      const data = await res.json();
      for (const symbol of symbols) {
        const id = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
        if (id && data[id]?.usd) prices[symbol.toUpperCase()] = data[id].usd;
      }
    }
  } catch (e) {
    console.error('Price fetch error:', e);
  }
  return prices;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;
    console.log(`🧹 Closing all paper positions for user ${userId}`);

    const { data: positions, error: posErr } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_paper', true);

    if (posErr) throw posErr;
    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ success: true, closed: 0, message: 'No open paper positions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const symbols = [...new Set(positions.map((p: any) => p.symbol.toUpperCase()))];
    const prices = await fetchLivePrices(symbols);

    let totalProceeds = 0;
    let totalPnl = 0;
    const closed: Array<{ symbol: string; pnl: number; proceeds: number }> = [];
    const skipped: string[] = [];

    for (const pos of positions) {
      const sym = pos.symbol.toUpperCase();
      const price = prices[sym] || Number(pos.current_price) || 0;
      if (!price) { skipped.push(sym); continue; }

      const qty = Number(pos.quantity);
      const entry = Number(pos.avg_entry_price);
      const proceeds = price * qty;
      const pnl = pos.side === 'buy' ? (price - entry) * qty : (entry - price) * qty;

      await supabase.from('trades').update({
        status: 'closed',
        exit_price: price,
        pnl,
        closed_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('symbol', pos.symbol).eq('is_paper', true).eq('status', 'open');

      await supabase.from('positions').delete().eq('id', pos.id);

      totalProceeds += proceeds;
      totalPnl += pnl;
      closed.push({ symbol: sym, pnl, proceeds });
    }

    // Credit proceeds to paper account
    const { data: acct } = await supabase
      .from('paper_account')
      .select('balance')
      .eq('user_id', userId)
      .single();

    const newBalance = Number(acct?.balance || 0) + totalProceeds;
    await supabase
      .from('paper_account')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    await supabase.from('ai_decisions').insert({
      user_id: userId,
      decision_type: 'manual_cleanup',
      action: 'close_all_paper',
      reasoning: `Manually closed ${closed.length} paper positions at market. Proceeds: $${totalProceeds.toFixed(2)}, realized P&L: $${totalPnl.toFixed(2)}. New balance: $${newBalance.toFixed(2)}.`,
    });

    // 🔁 CLEAR KILL-SWITCH ONLY — after a full close-out we clear the kill switch
    // so the user can press Start again, but we do NOT silently re-enable the bot.
    // The user pressed "close all" which implies they want to be in control of
    // when trading resumes. They must press Start Trading to come back online.
    await supabase.from('ai_settings').update({
      kill_switch_active: false,
      kill_switch_triggered_at: null,
      bot_status: 'idle',
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);

    await supabase.from('risk_events').insert({
      user_id: userId,
      event_type: 'manual_close_all',
      severity: 'info',
      message: 'All paper positions closed manually — bot left stopped, awaiting user Start',
      details: { trigger: 'manual_close_all_paper', closed: closed.length },
    });

    return new Response(JSON.stringify({
      success: true,
      closed: closed.length,
      skipped,
      totalProceeds,
      totalPnl,
      newBalance,
      details: closed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('close-all-paper-positions error:', e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

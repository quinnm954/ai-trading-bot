import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CRYPTO-SIGNALS] ${step}${detailsStr}`);
};

// Top crypto symbols to analyze
const TOP_CRYPTOS = [
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOGE', 'DOT', 'MATIC',
  'LINK', 'UNI', 'ATOM', 'LTC', 'FIL', 'APT', 'ARB', 'OP', 'INJ', 'SUI'
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Starting crypto signals scan");

    const { scanType = 'all' } = await req.json().catch(() => ({}));

    const results: any = {};

    // Scan whale signals
    if (scanType === 'all' || scanType === 'whale') {
      logStep("Scanning whale signals");
      const whaleSignals = await scanWhaleSignals();
      
      for (const signal of whaleSignals) {
        await supabase.from('whale_signals').insert(signal);
      }
      results.whaleSignals = whaleSignals.length;
      logStep("Whale signals saved", { count: whaleSignals.length });
    }

    // Scan sentiment signals
    if (scanType === 'all' || scanType === 'sentiment') {
      logStep("Scanning sentiment signals");
      const sentimentSignals = await scanSentimentSignals();
      
      for (const signal of sentimentSignals) {
        await supabase.from('sentiment_signals').upsert(signal, {
          onConflict: 'symbol,source'
        }).select();
      }
      results.sentimentSignals = sentimentSignals.length;
      logStep("Sentiment signals saved", { count: sentimentSignals.length });
    }

    // Scan MEV opportunities
    if (scanType === 'all' || scanType === 'mev') {
      logStep("Scanning MEV opportunities");
      const mevOpportunities = await scanMEVOpportunities();
      
      for (const opp of mevOpportunities) {
        await supabase.from('mev_opportunities').insert(opp);
      }
      results.mevOpportunities = mevOpportunities.length;
      logStep("MEV opportunities saved", { count: mevOpportunities.length });
    }

    // Update top traders
    if (scanType === 'all' || scanType === 'traders') {
      logStep("Updating top traders");
      const topTraders = await scanTopTraders();
      
      for (const trader of topTraders) {
        await supabase.from('top_traders').upsert(trader, {
          onConflict: 'wallet_address'
        });
      }
      results.topTraders = topTraders.length;
      logStep("Top traders updated", { count: topTraders.length });
    }

    // Scan DeFi yields
    if (scanType === 'all' || scanType === 'defi') {
      logStep("Scanning DeFi yields");
      const defiYields = await scanDeFiYields();
      
      for (const yield_ of defiYields) {
        await supabase.from('defi_yields').upsert(yield_, {
          onConflict: 'protocol,chain,pool_name'
        });
      }
      results.defiYields = defiYields.length;
      logStep("DeFi yields saved", { count: defiYields.length });
    }

    logStep("Scan complete", results);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// Simulate whale signal detection (would use blockchain APIs like Whale Alert, Etherscan, etc.)
async function scanWhaleSignals(): Promise<any[]> {
  const signals: any[] = [];
  
  // Simulated whale movements based on common patterns
  const actions = ['accumulation', 'distribution', 'transfer'];
  const selectedCryptos = TOP_CRYPTOS.slice(0, 10);
  
  for (const symbol of selectedCryptos) {
    // Simulate detecting whale activity
    const hasActivity = Math.random() > 0.6; // 40% chance of whale activity
    
    if (hasActivity) {
      const action = actions[Math.floor(Math.random() * actions.length)];
      const isLargeWhale = Math.random() > 0.7;
      
      signals.push({
        symbol,
        whale_address: `0x${generateRandomHex(40)}`,
        action,
        amount: isLargeWhale ? Math.random() * 10000 + 5000 : Math.random() * 1000 + 100,
        amount_usd: isLargeWhale ? Math.random() * 50000000 + 10000000 : Math.random() * 5000000 + 500000,
        transaction_hash: `0x${generateRandomHex(64)}`,
        from_exchange: action === 'distribution' ? Math.random() > 0.5 : false,
        to_exchange: action === 'distribution' ? Math.random() > 0.3 : false,
        confidence: Math.random() * 30 + 70, // 70-100 confidence
        detected_at: new Date().toISOString(),
      });
    }
  }
  
  return signals;
}

// Simulate sentiment analysis (would use LunarCrush, Santiment, Twitter API, etc.)
async function scanSentimentSignals(): Promise<any[]> {
  const signals: any[] = [];
  const sources = ['twitter', 'reddit', 'telegram', 'discord'];
  
  for (const symbol of TOP_CRYPTOS) {
    for (const source of sources) {
      // Only add signal for some source/symbol combinations
      if (Math.random() > 0.5) continue;
      
      const mentionCount = Math.floor(Math.random() * 10000) + 100;
      const bullishRatio = Math.random();
      const bullishCount = Math.floor(mentionCount * bullishRatio);
      const bearishCount = mentionCount - bullishCount;
      
      signals.push({
        symbol,
        source,
        sentiment_score: (bullishRatio - 0.5) * 2, // -1 to 1
        mention_count: mentionCount,
        bullish_count: bullishCount,
        bearish_count: bearishCount,
        trending_rank: Math.floor(Math.random() * 100) + 1,
        influencer_mentions: Math.floor(Math.random() * 50),
        sample_posts: JSON.stringify([
          { text: `$${symbol} looking bullish!`, likes: Math.floor(Math.random() * 1000) },
          { text: `Just bought more $${symbol}`, likes: Math.floor(Math.random() * 500) },
        ]),
        analyzed_at: new Date().toISOString(),
      });
    }
  }
  
  return signals;
}

// Simulate MEV opportunity detection (would use Flashbots, MEV-Explore, etc.)
async function scanMEVOpportunities(): Promise<any[]> {
  const opportunities: any[] = [];
  const types = ['arbitrage', 'sandwich', 'liquidation'];
  const chains = ['ethereum', 'bsc', 'arbitrum', 'polygon'];
  const riskLevels = ['low', 'medium', 'high'];
  
  // Generate a few MEV opportunities
  const numOpportunities = Math.floor(Math.random() * 5) + 1;
  
  for (let i = 0; i < numOpportunities; i++) {
    const symbol = TOP_CRYPTOS[Math.floor(Math.random() * TOP_CRYPTOS.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const estimatedProfit = Math.random() * 500 + 50;
    const gasCost = Math.random() * 50 + 10;
    
    opportunities.push({
      symbol,
      opportunity_type: type,
      estimated_profit_usd: estimatedProfit,
      gas_cost_usd: gasCost,
      net_profit_usd: estimatedProfit - gasCost,
      dex_pair: `${symbol}/USDT`,
      chain: chains[Math.floor(Math.random() * chains.length)],
      risk_level: riskLevels[Math.floor(Math.random() * riskLevels.length)],
      expires_at: new Date(Date.now() + 60000).toISOString(), // Expires in 1 minute
      detected_at: new Date().toISOString(),
    });
  }
  
  return opportunities;
}

// Simulate top trader tracking (would use Nansen, Arkham, Dune Analytics, etc.)
async function scanTopTraders(): Promise<any[]> {
  const traders: any[] = [];
  const styles = ['scalper', 'swing', 'holder', 'whale'];
  
  // Generate some top traders
  const numTraders = 20;
  
  for (let i = 0; i < numTraders; i++) {
    const winRate = Math.random() * 40 + 55; // 55-95% win rate
    const totalTrades = Math.floor(Math.random() * 1000) + 100;
    const avgProfit = Math.random() * 500 - 100; // -100 to 400
    
    traders.push({
      wallet_address: `0x${generateRandomHex(40)}`,
      display_name: `Trader_${generateRandomHex(4)}`,
      total_pnl_usd: avgProfit * totalTrades,
      win_rate: winRate,
      total_trades: totalTrades,
      avg_trade_size_usd: Math.random() * 50000 + 1000,
      best_performing_assets: TOP_CRYPTOS.slice(0, Math.floor(Math.random() * 5) + 1),
      trading_style: styles[Math.floor(Math.random() * styles.length)],
      risk_score: Math.random() * 100,
      followers_count: Math.floor(Math.random() * 10000),
      last_active_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  
  return traders;
}

// Simulate DeFi yield scanning (would use DefiLlama, Zapper, etc.)
async function scanDeFiYields(): Promise<any[]> {
  const yields: any[] = [];
  const protocols = [
    { name: 'Aave', chain: 'ethereum', audited: true },
    { name: 'Compound', chain: 'ethereum', audited: true },
    { name: 'Uniswap', chain: 'ethereum', audited: true },
    { name: 'Curve', chain: 'ethereum', audited: true },
    { name: 'PancakeSwap', chain: 'bsc', audited: true },
    { name: 'GMX', chain: 'arbitrum', audited: true },
    { name: 'Lido', chain: 'ethereum', audited: true },
    { name: 'Convex', chain: 'ethereum', audited: true },
    { name: 'Yearn', chain: 'ethereum', audited: true },
    { name: 'Balancer', chain: 'ethereum', audited: true },
  ];
  
  const riskLevels = ['low', 'medium', 'high'];
  
  for (const protocol of protocols) {
    // Generate 1-3 pools per protocol
    const numPools = Math.floor(Math.random() * 3) + 1;
    
    for (let i = 0; i < numPools; i++) {
      const asset = TOP_CRYPTOS[Math.floor(Math.random() * TOP_CRYPTOS.length)];
      const baseApy = Math.random() * 15 + 1; // 1-16% base APY
      const rewardsApy = Math.random() > 0.5 ? Math.random() * 10 : 0;
      const isLP = Math.random() > 0.6;
      
      yields.push({
        protocol: protocol.name,
        chain: protocol.chain,
        pool_name: isLP ? `${asset}/ETH LP` : `${asset} Supply`,
        asset_symbol: asset,
        apy: baseApy,
        tvl_usd: Math.random() * 500000000 + 1000000,
        risk_level: riskLevels[Math.floor(Math.random() * riskLevels.length)],
        impermanent_loss_risk: isLP,
        min_deposit_usd: Math.random() > 0.7 ? Math.random() * 1000 : 0,
        rewards_token: rewardsApy > 0 ? protocol.name.toUpperCase() : null,
        rewards_apy: rewardsApy,
        audited: protocol.audited,
        url: `https://${protocol.name.toLowerCase()}.finance`,
        updated_at: new Date().toISOString(),
      });
    }
  }
  
  return yields;
}

function generateRandomHex(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

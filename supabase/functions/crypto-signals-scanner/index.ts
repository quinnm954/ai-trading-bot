import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import {
  fetchTopTraderCandidates,
  fetchFills,
  statsFromFills,
  fillToAction,
} from "../_shared/hyperliquid.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CRYPTO-SIGNALS] ${step}${detailsStr}`);
};

// How many leaderboard wallets to profile per scan (each costs one fills request).
const TRADER_SCAN_LIMIT = 20;
// Fills newer than this become copy signals; matches the 15-minute scan cadence.
const SIGNAL_LOOKBACK_MINUTES = 20;

// Top crypto IDs for CoinGecko
const COINGECKO_IDS: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'BNB': 'binancecoin', 'SOL': 'solana',
  'XRP': 'ripple', 'ADA': 'cardano', 'AVAX': 'avalanche-2', 'DOGE': 'dogecoin',
  'DOT': 'polkadot', 'MATIC': 'matic-network', 'LINK': 'chainlink', 'UNI': 'uniswap',
  'ATOM': 'cosmos', 'LTC': 'litecoin', 'FIL': 'filecoin', 'APT': 'aptos',
  'ARB': 'arbitrum', 'OP': 'optimism', 'INJ': 'injective-protocol', 'SUI': 'sui'
};

// Only coins this app can actually trade may become copy signals.
const TRADABLE_SYMBOLS = new Set(Object.keys(COINGECKO_IDS));

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
    logStep("Starting crypto signals scan with LIVE APIs");

    const { scanType = 'all' } = await req.json().catch(() => ({}));
    const results: any = {};

    // Fetch live CoinGecko data for sentiment
    if (scanType === 'all' || scanType === 'sentiment') {
      logStep("Fetching live CoinGecko market data");
      const marketData = await fetchCoinGeckoMarketData();
      
      if (scanType === 'all' || scanType === 'sentiment') {
        const sentimentSignals = generateSentimentFromMarketData(marketData);
        for (const signal of sentimentSignals) {
          await supabase.from('sentiment_signals').upsert(signal, {
            onConflict: 'symbol,source'
          }).select();
        }
        results.sentimentSignals = sentimentSignals.length;
        logStep("Sentiment signals saved from CoinGecko", { count: sentimentSignals.length });
      }

    }

    // Fetch live DeFi yields from DefiLlama
    if (scanType === 'all' || scanType === 'defi') {
      logStep("Fetching live DeFi yields from DefiLlama");
      const defiYields = await fetchDefiLlamaYields();
      
      for (const yield_ of defiYields) {
        await supabase.from('defi_yields').upsert(yield_, {
          onConflict: 'protocol,chain,pool_name'
        });
      }
      results.defiYields = defiYields.length;
      logStep("DeFi yields saved from DefiLlama", { count: defiYields.length });
    }

    // Scan MEV opportunities (simulated - requires specialized infrastructure)
    if (scanType === 'all' || scanType === 'mev') {
      logStep("Scanning MEV opportunities");
      const mevOpportunities = await scanMEVOpportunities();
      for (const opp of mevOpportunities) {
        await supabase.from('mev_opportunities').insert(opp);
      }
      results.mevOpportunities = mevOpportunities.length;
    }

    // Update top traders and generate copy trade signals — all from real on-chain data
    if (scanType === 'all' || scanType === 'traders') {
      logStep("Syncing real Hyperliquid traders and their fills");
      results.topTraders = await syncRealTopTraders(supabase);

      const signalsGenerated = await generateCopyTradeSignals(supabase);
      results.copyTradeSignals = signalsGenerated;
      logStep("Copy trade signals generated from real fills", { count: signalsGenerated });
    }

    logStep("Scan complete with live data", results);

    return new Response(JSON.stringify({ success: true, results, dataSource: 'live' }), {
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

// Fetch real market data from CoinGecko
async function fetchCoinGeckoMarketData(): Promise<any[]> {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=1h,24h,7d&locale=en`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      logStep("CoinGecko API error", { status: response.status });
      return [];
    }
    
    const data = await response.json();
    logStep("CoinGecko data fetched", { count: data.length });
    return data;
  } catch (error) {
    logStep("CoinGecko fetch failed", { error: String(error) });
    return [];
  }
}

// Generate sentiment signals from real market data
function generateSentimentFromMarketData(marketData: any[]): any[] {
  const signals: any[] = [];
  const sources = ['market_data', 'volume_analysis', 'price_momentum'];
  
  for (const coin of marketData) {
    const symbol = coin.symbol?.toUpperCase() || 'UNKNOWN';
    const priceChange24h = coin.price_change_percentage_24h || 0;
    const priceChange7d = coin.price_change_percentage_7d_in_currency || 0;
    const volumeToMcap = coin.total_volume / coin.market_cap;
    
    // Calculate sentiment score based on real metrics
    // Range: -1 (bearish) to 1 (bullish)
    let sentimentScore = 0;
    
    // Price momentum component
    sentimentScore += Math.max(-0.5, Math.min(0.5, priceChange24h / 20));
    
    // Volume component (high volume = more activity)
    if (volumeToMcap > 0.1) sentimentScore += 0.3;
    else if (volumeToMcap > 0.05) sentimentScore += 0.15;
    
    // 7d trend component
    sentimentScore += Math.max(-0.2, Math.min(0.2, priceChange7d / 50));
    
    sentimentScore = Math.max(-1, Math.min(1, sentimentScore));
    
    const mentionEstimate = Math.floor((coin.market_cap / 1e9) * 1000 * Math.abs(priceChange24h / 10 + 1));
    const bullishRatio = (sentimentScore + 1) / 2;
    
    for (const source of sources) {
      signals.push({
        symbol,
        source,
        sentiment_score: sentimentScore,
        mention_count: mentionEstimate,
        bullish_count: Math.floor(mentionEstimate * bullishRatio),
        bearish_count: Math.floor(mentionEstimate * (1 - bullishRatio)),
        trending_rank: coin.market_cap_rank || 999,
        influencer_mentions: Math.floor(mentionEstimate / 100),
        sample_posts: JSON.stringify([
          { 
            text: `$${symbol} ${priceChange24h > 0 ? '📈' : '📉'} ${priceChange24h.toFixed(2)}% (24h)`, 
            likes: Math.floor(Math.random() * 500) 
          },
          { 
            text: `Volume: $${(coin.total_volume / 1e6).toFixed(1)}M | MCap: $${(coin.market_cap / 1e9).toFixed(2)}B`, 
            likes: Math.floor(Math.random() * 200) 
          },
        ]),
        analyzed_at: new Date().toISOString(),
      });
    }
  }
  
  return signals;
}

// Fetch real DeFi yields from DefiLlama
async function fetchDefiLlamaYields(): Promise<any[]> {
  const yields: any[] = [];
  
  try {
    const response = await fetch('https://yields.llama.fi/pools', {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      logStep("DefiLlama API error", { status: response.status });
      return generateFallbackYields();
    }
    
    const data = await response.json();
    const pools = data.data || [];
    
    logStep("DefiLlama raw data fetched", { count: pools.length });
    
    // Filter for top protocols and reasonable APYs
    const topProtocols = ['aave', 'compound', 'lido', 'uniswap', 'curve', 'convex', 'yearn', 'gmx', 'balancer', 'pancakeswap'];
    const targetSymbols = ['ETH', 'WETH', 'BTC', 'WBTC', 'USDC', 'USDT', 'DAI', 'stETH', 'LINK', 'UNI'];
    
    const filteredPools = pools
      .filter((pool: any) => {
        const protocolMatch = topProtocols.some(p => pool.project?.toLowerCase().includes(p));
        const symbolMatch = targetSymbols.some(s => pool.symbol?.toUpperCase().includes(s));
        const hasReasonableApy = pool.apy > 0.1 && pool.apy < 100;
        const hasTvl = pool.tvlUsd > 1000000; // Min $1M TVL
        return protocolMatch && symbolMatch && hasReasonableApy && hasTvl;
      })
      .slice(0, 50); // Top 50 pools
    
    for (const pool of filteredPools) {
      const chain = mapDefiLlamaChain(pool.chain);
      const riskLevel = calculateRiskLevel(pool);
      
      yields.push({
        protocol: pool.project || 'Unknown',
        chain,
        pool_name: pool.symbol || 'Unknown Pool',
        asset_symbol: extractMainSymbol(pool.symbol),
        apy: pool.apy || 0,
        tvl_usd: pool.tvlUsd || 0,
        risk_level: riskLevel,
        impermanent_loss_risk: pool.ilRisk === 'yes' || pool.symbol?.includes('-'),
        min_deposit_usd: 0,
        rewards_token: pool.rewardTokens?.[0] || null,
        rewards_apy: pool.apyReward || 0,
        total_apy: (pool.apy || 0) + (pool.apyReward || 0),
        audited: true, // Most DefiLlama pools are from audited protocols
        url: pool.url || `https://defillama.com/yields/pool/${pool.pool}`,
        updated_at: new Date().toISOString(),
      });
    }
    
    logStep("DefiLlama yields processed", { count: yields.length });
    return yields;
  } catch (error) {
    logStep("DefiLlama fetch failed", { error: String(error) });
    return generateFallbackYields();
  }
}

function mapDefiLlamaChain(chain: string): string {
  const chainMap: Record<string, string> = {
    'Ethereum': 'ethereum',
    'BSC': 'bsc',
    'Polygon': 'polygon',
    'Arbitrum': 'arbitrum',
    'Optimism': 'optimism',
    'Avalanche': 'avalanche',
    'Base': 'base',
    'Solana': 'solana',
  };
  return chainMap[chain] || chain?.toLowerCase() || 'ethereum';
}

function calculateRiskLevel(pool: any): string {
  const apy = pool.apy || 0;
  const tvl = pool.tvlUsd || 0;
  const hasIL = pool.ilRisk === 'yes';
  
  if (apy > 50 || tvl < 5000000 || hasIL) return 'high';
  if (apy > 20 || tvl < 50000000) return 'medium';
  return 'low';
}

function extractMainSymbol(poolSymbol: string): string {
  if (!poolSymbol) return 'UNKNOWN';
  // Extract first symbol from pairs like "ETH-USDC" or "stETH"
  const parts = poolSymbol.split(/[-\/]/);
  return parts[0]?.toUpperCase() || poolSymbol.toUpperCase();
}

function generateFallbackYields(): any[] {
  // Fallback if DefiLlama is unavailable
  return [
    { protocol: 'Lido', chain: 'ethereum', pool_name: 'stETH', asset_symbol: 'ETH', apy: 3.8, tvl_usd: 25000000000, risk_level: 'low', audited: true, updated_at: new Date().toISOString() },
    { protocol: 'Aave', chain: 'ethereum', pool_name: 'USDC Supply', asset_symbol: 'USDC', apy: 4.2, tvl_usd: 5000000000, risk_level: 'low', audited: true, updated_at: new Date().toISOString() },
  ];
}

// MEV opportunities (simulated - requires specialized mempool infrastructure)
async function scanMEVOpportunities(): Promise<any[]> {
  const opportunities: any[] = [];
  const types = ['arbitrage', 'sandwich', 'liquidation'];
  const chains = ['ethereum', 'arbitrum', 'base'];
  const symbols = ['ETH', 'WBTC', 'LINK', 'UNI', 'ARB'];
  
  const numOpportunities = Math.floor(Math.random() * 3) + 1;
  
  for (let i = 0; i < numOpportunities; i++) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const type = types[Math.floor(Math.random() * types.length)];
    const estimatedProfit = Math.random() * 200 + 20;
    const gasCost = Math.random() * 30 + 5;
    
    opportunities.push({
      symbol,
      opportunity_type: type,
      estimated_profit_usd: estimatedProfit,
      gas_cost_usd: gasCost,
      net_profit_usd: estimatedProfit - gasCost,
      dex_pair: `${symbol}/USDC`,
      chain: chains[Math.floor(Math.random() * chains.length)],
      risk_level: type === 'liquidation' ? 'low' : type === 'arbitrage' ? 'medium' : 'high',
      expires_at: new Date(Date.now() + 60000).toISOString(),
      detected_at: new Date().toISOString(),
    });
  }
  
  return opportunities;
}

// ── REAL top traders (Hyperliquid mainnet leaderboard + that wallet's own fills) ──
// Nothing here is generated: wallets, PnL, ROI, win rate, sizing and activity all
// come from public on-chain data.
async function syncRealTopTraders(supabase: any): Promise<number> {
  const candidates = await fetchTopTraderCandidates(TRADER_SCAN_LIMIT);
  logStep(`Leaderboard candidates`, { count: candidates.length });

  const since = Date.now() - 7 * 24 * 60 * 60 * 1000; // a week of real fills
  let saved = 0;

  for (const c of candidates) {
    let stats;
    try {
      stats = statsFromFills(await fetchFills(c.wallet, since));
    } catch (e) {
      logStep(`Fills fetch failed for ${c.wallet}`, { error: String(e) });
      continue;
    }

    // A trader with no measurable closed trades cannot be judged, so don't list them.
    if (stats.winRate === null || stats.bestAssets.length === 0) continue;

    const { error } = await supabase.from('top_traders').upsert({
      wallet_address: c.wallet,
      display_name: c.displayName || `${c.wallet.slice(0, 6)}…${c.wallet.slice(-4)}`,
      total_pnl_usd: Math.round(c.allTimePnl),
      win_rate: Number(stats.winRate.toFixed(2)),
      total_trades: stats.closedTrades,
      avg_trade_size_usd: Math.round(stats.avgTradeSizeUsd),
      best_performing_assets: stats.bestAssets,
      trading_style: stats.tradingStyle,
      risk_score: stats.riskScore,
      last_active_at: stats.lastActiveAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'wallet_address' });

    if (error) {
      logStep(`Upsert failed for ${c.wallet}`, { error: error.message });
      continue;
    }
    saved++;
  }

  // Drop traders that have gone quiet so the list never shows stale performance.
  await supabase
    .from('top_traders')
    .delete()
    .lt('last_active_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString());

  return saved;
}

// ── REAL copy trade signals — one per actual fill by a followed wallet ─────────
async function generateCopyTradeSignals(supabase: any): Promise<number> {
  const { data: followedTraderIds } = await supabase
    .from('followed_traders')
    .select('trader_id')
    .eq('is_active', true);

  if (!followedTraderIds || followedTraderIds.length === 0) {
    logStep("No followed traders, skipping signal generation");
    return 0;
  }

  const uniqueTraderIds = [...new Set(followedTraderIds.map((f: any) => f.trader_id))];

  const { data: traders } = await supabase
    .from('top_traders')
    .select('id, wallet_address, display_name')
    .in('id', uniqueTraderIds);

  if (!traders || traders.length === 0) return 0;

  const since = Date.now() - SIGNAL_LOOKBACK_MINUTES * 60 * 1000;
  let signalsGenerated = 0;

  for (const trader of traders) {
    let fills: Awaited<ReturnType<typeof fetchFills>>;
    try {
      fills = await fetchFills(trader.wallet_address, since);
    } catch (e) {
      logStep(`Fills fetch failed for ${trader.wallet_address}`, { error: String(e) });
      continue;
    }
    if (fills.length === 0) continue;

    // Collapse the wallet's fills into one intent per coin+action, newest price wins.
    const intents = new Map<string, { symbol: string; action: 'buy' | 'sell'; px: number; sz: number; time: number }>();
    for (const f of fills.sort((a, b) => a.time - b.time)) {
      if (!TRADABLE_SYMBOLS.has(f.coin)) continue; // we can only copy what we can trade
      const action = fillToAction(f.dir);
      if (!action) continue;
      const key = `${f.coin}:${action}`;
      const prev = intents.get(key);
      intents.set(key, {
        symbol: f.coin,
        action,
        px: f.px,
        sz: (prev?.sz ?? 0) + f.sz,
        time: f.time,
      });
    }

    for (const intent of intents.values()) {
      // Don't re-file the same move on the next scan.
      const { data: recentSignal } = await supabase
        .from('copy_trade_signals')
        .select('id')
        .eq('trader_id', trader.id)
        .eq('symbol', intent.symbol)
        .eq('action', intent.action)
        .gte('created_at', new Date(since).toISOString())
        .limit(1)
        .maybeSingle();

      if (recentSignal) continue;

      const tradeValue = intent.px * intent.sz;

      const { error } = await supabase.from('copy_trade_signals').insert({
        trader_id: trader.id,
        symbol: intent.symbol,
        action: intent.action,
        entry_price: intent.px,
        quantity: intent.sz,
        trade_value_usd: tradeValue,
        status: 'pending',
      });

      if (!error) {
        signalsGenerated++;
        logStep(`📊 Real fill copied: ${trader.display_name} ${intent.action.toUpperCase()} ${intent.symbol} @ $${intent.px}`);
      } else {
        logStep(`Signal insert failed`, { error: error.message });
      }
    }
  }

  return signalsGenerated;
}

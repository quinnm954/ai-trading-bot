import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Top 50 cryptocurrencies to scan
const CRYPTO_IDS = [
  'bitcoin', 'ethereum', 'tether', 'binancecoin', 'solana', 'ripple', 'usd-coin',
  'cardano', 'avalanche-2', 'dogecoin', 'polkadot', 'tron', 'chainlink', 'polygon',
  'shiba-inu', 'litecoin', 'bitcoin-cash', 'uniswap', 'stellar', 'monero',
  'ethereum-classic', 'cosmos', 'filecoin', 'hedera-hashgraph', 'internet-computer',
  'lido-dao', 'aptos', 'arbitrum', 'vechain', 'near', 'optimism', 'injective-protocol',
  'render-token', 'the-graph', 'theta-token', 'fantom', 'algorand', 'flow', 'aave',
  'quant-network', 'elrond-erd-2', 'axie-infinity', 'decentraland', 'the-sandbox',
  'eos', 'maker', 'neo', 'kucoin-shares', 'pepe', 'bonk'
];

const SYMBOL_MAP: Record<string, string> = {
  'bitcoin': 'BTC', 'ethereum': 'ETH', 'tether': 'USDT', 'binancecoin': 'BNB',
  'solana': 'SOL', 'ripple': 'XRP', 'usd-coin': 'USDC', 'cardano': 'ADA',
  'avalanche-2': 'AVAX', 'dogecoin': 'DOGE', 'polkadot': 'DOT', 'tron': 'TRX',
  'chainlink': 'LINK', 'polygon': 'MATIC', 'shiba-inu': 'SHIB', 'litecoin': 'LTC',
  'bitcoin-cash': 'BCH', 'uniswap': 'UNI', 'stellar': 'XLM', 'monero': 'XMR',
  'ethereum-classic': 'ETC', 'cosmos': 'ATOM', 'filecoin': 'FIL', 
  'hedera-hashgraph': 'HBAR', 'internet-computer': 'ICP', 'lido-dao': 'LDO',
  'aptos': 'APT', 'arbitrum': 'ARB', 'vechain': 'VET', 'near': 'NEAR',
  'optimism': 'OP', 'injective-protocol': 'INJ', 'render-token': 'RNDR',
  'the-graph': 'GRT', 'theta-token': 'THETA', 'fantom': 'FTM', 'algorand': 'ALGO',
  'flow': 'FLOW', 'aave': 'AAVE', 'quant-network': 'QNT', 'elrond-erd-2': 'EGLD',
  'axie-infinity': 'AXS', 'decentraland': 'MANA', 'the-sandbox': 'SAND',
  'eos': 'EOS', 'maker': 'MKR', 'neo': 'NEO', 'kucoin-shares': 'KCS',
  'pepe': 'PEPE', 'bonk': 'BONK'
};

interface CoinData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  total_volume: number;
  price_change_percentage_24h: number;
  price_change_percentage_7d_in_currency?: number;
  high_24h: number;
  low_24h: number;
  market_cap: number;
  ath_change_percentage: number;
}

// Calculate volume score based on 24h volume relative to market cap
function calculateVolumeScore(coin: CoinData): { score: number; tags: string[] } {
  const tags: string[] = [];
  let score = 0;
  
  // Volume to market cap ratio (higher = more activity)
  const volumeRatio = coin.total_volume / coin.market_cap;
  
  if (volumeRatio > 0.5) {
    score = 100;
    tags.push('🔥 Extreme Volume');
  } else if (volumeRatio > 0.3) {
    score = 85;
    tags.push('📈 Volume Spike');
  } else if (volumeRatio > 0.15) {
    score = 70;
    tags.push('📊 High Volume');
  } else if (volumeRatio > 0.08) {
    score = 50;
  } else {
    score = 30;
  }
  
  // Bonus for significant price movement with volume
  if (Math.abs(coin.price_change_percentage_24h) > 10 && volumeRatio > 0.1) {
    score = Math.min(100, score + 15);
    if (!tags.includes('📈 Volume Spike')) tags.push('⚡ Volatility Surge');
  }
  
  return { score, tags };
}

// Calculate liquidity score (simplified - based on market cap and volume)
function calculateLiquidityScore(coin: CoinData): { score: number; tags: string[] } {
  const tags: string[] = [];
  let score = 0;
  
  // Higher market cap = more liquidity
  if (coin.market_cap > 10_000_000_000) {
    score = 90;
  } else if (coin.market_cap > 1_000_000_000) {
    score = 75;
  } else if (coin.market_cap > 100_000_000) {
    score = 60;
    tags.push('💎 Mid-Cap Gem');
  } else if (coin.market_cap > 10_000_000) {
    score = 45;
    tags.push('🚀 Low-Cap Potential');
  } else {
    score = 30;
    tags.push('⚠️ Low Liquidity');
  }
  
  // Volume indicates active trading
  if (coin.total_volume > 1_000_000_000) {
    score = Math.min(100, score + 10);
  }
  
  return { score, tags };
}

// Calculate sentiment score (placeholder - returns simulated values)
function calculateSentimentScore(coin: CoinData): { score: number; tags: string[] } {
  const tags: string[] = [];
  
  // Simulated sentiment based on price action (placeholder for real API integration)
  let score = 50; // Base neutral sentiment
  
  // Positive price action suggests positive sentiment
  if (coin.price_change_percentage_24h > 15) {
    score = 85;
    tags.push('🐦 Strong Social Buzz');
  } else if (coin.price_change_percentage_24h > 8) {
    score = 75;
    tags.push('💬 Rising Interest');
  } else if (coin.price_change_percentage_24h > 3) {
    score = 65;
  } else if (coin.price_change_percentage_24h < -10) {
    score = 30;
  }
  
  // Popular meme coins get sentiment boost
  if (['PEPE', 'BONK', 'DOGE', 'SHIB'].includes(SYMBOL_MAP[coin.id] || coin.symbol.toUpperCase())) {
    score = Math.min(100, score + 10);
    if (coin.price_change_percentage_24h > 5) {
      tags.push('🔥 Meme Momentum');
    }
  }
  
  return { score, tags };
}

// Calculate whale activity score (placeholder - returns simulated values)
function calculateWhaleScore(coin: CoinData): { score: number; tags: string[] } {
  const tags: string[] = [];
  
  // Simulated whale activity based on volume and market cap patterns
  let score = 50;
  
  const volumeRatio = coin.total_volume / coin.market_cap;
  
  // High volume on mid/low caps might indicate whale accumulation
  if (coin.market_cap < 1_000_000_000 && volumeRatio > 0.2) {
    score = 80;
    tags.push('🐋 Whale Accumulation');
  } else if (coin.market_cap < 5_000_000_000 && volumeRatio > 0.15) {
    score = 70;
    tags.push('👀 Smart Money Activity');
  } else if (volumeRatio > 0.1) {
    score = 60;
  }
  
  // Price recovery from ATH might indicate accumulation
  if (coin.ath_change_percentage < -80 && coin.price_change_percentage_24h > 5) {
    score = Math.min(100, score + 15);
    tags.push('📉 Accumulation Zone');
  }
  
  return { score, tags };
}

// Calculate technical score based on price patterns
function calculateTechnicalScore(coin: CoinData): { score: number; tags: string[] } {
  const tags: string[] = [];
  let score = 50;
  
  const change24h = coin.price_change_percentage_24h;
  const change7d = coin.price_change_percentage_7d_in_currency || 0;
  
  // Bullish momentum: positive 24h and 7d
  if (change24h > 5 && change7d > 10) {
    score = 85;
    tags.push('📈 Strong Uptrend');
  } else if (change24h > 3 && change7d > 5) {
    score = 75;
    tags.push('✅ Bullish Momentum');
  }
  
  // Breakout detection: strong 24h move after consolidation
  if (change24h > 10 && Math.abs(change7d) < 5) {
    score = 90;
    tags.push('🚀 Breakout Detected');
  }
  
  // Reversal potential: down 7d but up 24h
  if (change7d < -10 && change24h > 5) {
    score = Math.min(100, score + 10);
    tags.push('🔄 Reversal Signal');
  }
  
  // RSI-like oversold bounce
  if (coin.ath_change_percentage < -70 && change24h > 3) {
    score = Math.min(100, score + 10);
    tags.push('💰 Oversold Bounce');
  }
  
  // Overbought warning
  if (change24h > 30) {
    score = Math.max(40, score - 20);
    tags.push('⚠️ Overbought Risk');
  }
  
  return { score, tags };
}

// Calculate final pump probability with weighted formula
function calculatePumpProbability(
  volumeScore: number,
  liquidityScore: number,
  sentimentScore: number,
  whaleScore: number,
  technicalScore: number
): number {
  const probability = 
    0.30 * volumeScore +
    0.20 * liquidityScore +
    0.20 * sentimentScore +
    0.20 * whaleScore +
    0.10 * technicalScore;
  
  return Math.round(probability * 10) / 10;
}

async function fetchMarketData(): Promise<CoinData[]> {
  const ids = CRYPTO_IDS.join(',');
  
  try {
    // Try CoinGecko first
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h,7d`
    );
    
    if (response.ok) {
      return await response.json();
    }
    
    console.log('CoinGecko rate limited, using CoinCap fallback...');
  } catch (error) {
    console.error('CoinGecko error:', error);
  }
  
  // Fallback to CoinCap
  try {
    const response = await fetch('https://api.coincap.io/v2/assets?limit=50');
    const data = await response.json();
    
    return data.data.map((item: any) => ({
      id: item.id,
      symbol: item.symbol,
      name: item.name,
      current_price: parseFloat(item.priceUsd || '0'),
      total_volume: parseFloat(item.volumeUsd24Hr || '0'),
      price_change_percentage_24h: parseFloat(item.changePercent24Hr || '0'),
      price_change_percentage_7d_in_currency: 0,
      high_24h: parseFloat(item.priceUsd || '0') * 1.02,
      low_24h: parseFloat(item.priceUsd || '0') * 0.98,
      market_cap: parseFloat(item.marketCapUsd || '0'),
      ath_change_percentage: -50,
    }));
  } catch (error) {
    console.error('CoinCap error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // GET /moonshot-scanner/top - Get top moonshot candidates
    if (req.method === 'GET' && path === 'top') {
      const { data, error } = await supabase
        .from('moonshot_signals')
        .select('*')
        .order('pump_probability', { ascending: false })
        .limit(10);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /moonshot-scanner/:symbol - Get specific coin breakdown
    if (req.method === 'GET' && path && path !== 'scan' && path !== 'top') {
      const symbol = path.toUpperCase();
      
      const { data, error } = await supabase
        .from('moonshot_signals')
        .select('*')
        .eq('symbol', symbol)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /moonshot-scanner/scan - Run the scanner
    console.log('🔍 Starting Moonshot Scanner...');
    
    const marketData = await fetchMarketData();
    console.log(`📊 Fetched data for ${marketData.length} coins`);

    const signals = [];

    for (const coin of marketData) {
      const { score: volumeScore, tags: volumeTags } = calculateVolumeScore(coin);
      const { score: liquidityScore, tags: liquidityTags } = calculateLiquidityScore(coin);
      const { score: sentimentScore, tags: sentimentTags } = calculateSentimentScore(coin);
      const { score: whaleScore, tags: whaleTags } = calculateWhaleScore(coin);
      const { score: technicalScore, tags: technicalTags } = calculateTechnicalScore(coin);

      const pumpProbability = calculatePumpProbability(
        volumeScore,
        liquidityScore,
        sentimentScore,
        whaleScore,
        technicalScore
      );

      const allTags = [...new Set([
        ...volumeTags,
        ...liquidityTags,
        ...sentimentTags,
        ...whaleTags,
        ...technicalTags
      ])];

      signals.push({
        symbol: SYMBOL_MAP[coin.id] || coin.symbol.toUpperCase(),
        name: coin.name,
        pump_probability: pumpProbability,
        volume_score: volumeScore,
        liquidity_score: liquidityScore,
        sentiment_score: sentimentScore,
        whale_score: whaleScore,
        technical_score: technicalScore,
        price_usd: coin.current_price,
        volume_24h: coin.total_volume,
        price_change_24h: coin.price_change_percentage_24h,
        signal_tags: allTags.slice(0, 3), // Keep top 3 tags
      });
    }

    // Sort by pump probability
    signals.sort((a, b) => b.pump_probability - a.pump_probability);

    console.log(`🎯 Top 5 Moonshot Candidates:`);
    signals.slice(0, 5).forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.symbol}: ${s.pump_probability}% - ${s.signal_tags.join(', ')}`);
    });

    // Upsert signals to database
    for (const signal of signals) {
      const { error } = await supabase
        .from('moonshot_signals')
        .upsert(signal, { onConflict: 'symbol' });
      
      if (error) {
        console.error(`Error upserting ${signal.symbol}:`, error);
      }
    }

    console.log('✅ Moonshot Scanner completed successfully');

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Scanned ${signals.length} coins`,
      topCandidates: signals.slice(0, 10)
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Moonshot Scanner error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

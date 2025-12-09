import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  high24h: number;
  low24h: number;
}

interface AITradingDecision {
  action: 'buy' | 'sell' | 'hold';
  symbol: string;
  reason: string;
  confidence: number;
  suggestedSize: number;
  pattern?: string;
}

interface TrendAnalysis {
  symbol: string;
  trend: 'strong_uptrend' | 'uptrend' | 'neutral' | 'downtrend' | 'strong_downtrend';
  trendStrength: number; // -1 to 1 (-1 = strong down, 1 = strong up)
  shouldTrade: boolean;
  reason: string;
}

// Fetch current crypto prices from CoinGecko with retry logic
async function fetchMarketData(): Promise<MarketData[]> {
  // Top 50 cryptocurrencies by market cap
  const cryptos = [
    'bitcoin', 'ethereum', 'tether', 'xrp', 'bnb', 'solana', 'usdc', 'dogecoin',
    'cardano', 'tron', 'avalanche-2', 'chainlink', 'shiba-inu', 'stellar', 'polkadot',
    'hedera', 'bitcoin-cash', 'uniswap', 'sui', 'litecoin', 'pepe', 'near', 'aptos',
    'internet-computer', 'ethereum-classic', 'render-token', 'cronos', 'kaspa',
    'aave', 'vechain', 'polygon', 'algorand', 'cosmos', 'fantom', 'filecoin',
    'arbitrum', 'optimism', 'injective', 'immutable-x', 'theta-token', 'sei',
    'celestia', 'bonk', 'floki', 'jupiter', 'ondo-finance', 'fetch-ai', 'worldcoin',
    'pyth-network', 'jito-governance-token'
  ];
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // CoinGecko allows up to 250 coins per request
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cryptos.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h&per_page=100`;
      const response = await fetch(url);
      
      if (response.status === 429) {
        console.log(`CoinGecko rate limited, attempt ${attempt + 1}/3, waiting...`);
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      
      if (!response.ok) {
        console.error('CoinGecko API error:', response.status);
        break;
      }
      
      const data = await response.json();
      console.log(`📊 Fetched ${data.length} crypto assets from CoinGecko`);
      
      return data.map((coin: any) => ({
        symbol: coin.symbol.toUpperCase(),
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h || 0,
        volume: coin.total_volume,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
      }));
    } catch (error) {
      console.error('Error fetching from CoinGecko:', error);
    }
  }
  
  // Fallback: Try CoinCap API with top 50 assets
  console.log('Trying CoinCap API as fallback...');
  try {
    const response = await fetch('https://api.coincap.io/v2/assets?limit=50');
    
    if (response.ok) {
      const { data } = await response.json();
      console.log(`📊 Fetched ${data.length} crypto assets from CoinCap`);
      
      return data.map((coin: any) => ({
        symbol: coin.symbol,
        price: parseFloat(coin.priceUsd),
        change24h: parseFloat(coin.changePercent24Hr) || 0,
        volume: parseFloat(coin.volumeUsd24Hr),
        high24h: parseFloat(coin.priceUsd) * 1.02,
        low24h: parseFloat(coin.priceUsd) * 0.98,
      }));
    }
  } catch (error) {
    console.error('CoinCap API also failed:', error);
  }
  
  // Last resort: Return mock data for major coins
  console.log('Using fallback mock data');
  return [
    { symbol: 'BTC', price: 90000, change24h: -1.5, volume: 40000000000, high24h: 92000, low24h: 89000 },
    { symbol: 'ETH', price: 3100, change24h: -0.5, volume: 20000000000, high24h: 3200, low24h: 3050 },
    { symbol: 'SOL', price: 130, change24h: -0.8, volume: 5000000000, high24h: 138, low24h: 128 },
    { symbol: 'XRP', price: 2.05, change24h: -0.7, volume: 3000000000, high24h: 2.15, low24h: 2.00 },
    { symbol: 'DOGE', price: 0.14, change24h: 0.5, volume: 1000000000, high24h: 0.145, low24h: 0.138 },
  ];
}

// Analyze trend for each coin using multiple signals
function analyzeTrend(coin: MarketData): TrendAnalysis {
  const priceRange = coin.high24h - coin.low24h;
  const pricePosition = priceRange > 0 ? (coin.price - coin.low24h) / priceRange : 0.5;
  
  // Calculate trend strength based on multiple factors
  let trendScore = 0;
  
  // Factor 1: 24h price change (weight: 40%)
  const changeScore = Math.max(-1, Math.min(1, coin.change24h / 10));
  trendScore += changeScore * 0.4;
  
  // Factor 2: Price position in daily range (weight: 30%)
  // Near high = bullish, near low = bearish
  const positionScore = (pricePosition - 0.5) * 2; // -1 to 1
  trendScore += positionScore * 0.3;
  
  // Factor 3: Momentum (if price is moving with change, weight: 30%)
  // If down and near lows = strong downtrend, if up and near highs = strong uptrend
  const momentumAlignment = coin.change24h > 0 && pricePosition > 0.5 ? 1 :
                            coin.change24h < 0 && pricePosition < 0.5 ? -1 : 0;
  trendScore += momentumAlignment * 0.3;
  
  // Determine trend classification
  let trend: TrendAnalysis['trend'];
  let shouldTrade = true;
  let reason = '';
  
  // AGGRESSIVE MODE: Trade more coins, only avoid catastrophic drops
  if (trendScore >= 0.5) {
    trend = 'strong_uptrend';
    reason = `🚀 Strong uptrend: +${coin.change24h.toFixed(1)}%`;
  } else if (trendScore >= 0.1) {
    trend = 'uptrend';
    reason = `📈 Uptrend: +${coin.change24h.toFixed(1)}%`;
  } else if (trendScore <= -0.7) {
    trend = 'strong_downtrend';
    // Still trade oversold bounces, just smaller size
    shouldTrade = coin.change24h > -5; // Only avoid >5% drops
    reason = shouldTrade ? `💰 Oversold bounce: ${coin.change24h.toFixed(1)}%` : `⚠️ CRASH: ${coin.change24h.toFixed(1)}%`;
  } else if (trendScore <= -0.3) {
    trend = 'downtrend';
    shouldTrade = true; // Trade dips for bounce plays
    reason = `📉 Dip buy opportunity: ${coin.change24h.toFixed(1)}%`;
  } else {
    trend = 'neutral';
    shouldTrade = true;
    reason = `➡️ Consolidating: ${coin.change24h.toFixed(1)}%`;
  }
  
  // Only avoid catastrophic drops (>5%)
  if (coin.change24h <= -5) {
    shouldTrade = false;
    trend = 'strong_downtrend';
    reason = `🚫 CRASH: ${coin.change24h.toFixed(1)}% - AVOIDING`;
  }
  
  return {
    symbol: coin.symbol,
    trend,
    trendStrength: trendScore,
    shouldTrade,
    reason,
  };
}

// Analyze all coins and filter out downtrending ones
function filterByTrend(marketData: MarketData[]): { tradeable: MarketData[], trendAnalysis: TrendAnalysis[] } {
  const trendAnalysis = marketData.map(coin => analyzeTrend(coin));
  const tradeable = marketData.filter(coin => {
    const analysis = trendAnalysis.find(t => t.symbol === coin.symbol);
    return analysis?.shouldTrade ?? false;
  });
  
  return { tradeable, trendAnalysis };
}

// AI-powered market analysis using Lovable AI
async function analyzeWithAI(marketData: MarketData[], balance: number, maxPositionSize: number, trendAnalysis: TrendAnalysis[]): Promise<AITradingDecision[]> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.log('No Lovable API key, falling back to rule-based analysis');
    return [];
  }

  // Build trend context for AI
  const trendContext = trendAnalysis.map(t => `${t.symbol}: ${t.trend} (${t.reason})`).join('\n');

  const prompt = `You are an expert crypto scalp trader. Analyze this real-time market data and identify the BEST trading opportunities for quick 1-2% profits.

CRITICAL: TREND ANALYSIS - Read carefully and DO NOT trade against trends!
${trendContext}

MARKET DATA (only tradeable coins with positive/neutral trends):
${marketData.map(m => `${m.symbol}: $${m.price.toFixed(2)} | 24h: ${m.change24h > 0 ? '+' : ''}${m.change24h.toFixed(2)}% | Range: $${m.low24h.toFixed(2)}-$${m.high24h.toFixed(2)} | Vol: $${(m.volume/1e9).toFixed(1)}B`).join('\n')}

TRADING PARAMETERS:
- Available Balance: $${balance.toFixed(2)}
- Max Position Size: ${maxPositionSize}% of balance per trade
- Target: Quick 1-2% scalp profits
- Stop Loss: -0.5%

ANALYZE FOR:
1. **Momentum plays**: Coins with strong UPWARD directional movement ONLY
2. **Reversal patterns**: ONLY if coin is not in a downtrend
3. **Volatility opportunities**: High range = quick profit potential
4. **Volume confirmation**: High volume validates moves

CRITICAL RULES:
- NEVER buy coins in downtrend or strong_downtrend
- ONLY trade coins showing positive momentum or neutral consolidation
- If no good opportunities exist, return empty array

Return ONLY a JSON array (no markdown, no explanation) with your top 3 trade recommendations:
[{"symbol":"BTC","action":"buy","confidence":0.85,"reason":"Strong momentum breakout with volume confirmation","pattern":"bullish_momentum","size_percent":8}]

Rules:
- confidence: 0.0 to 1.0
- action: "buy", "sell", or "hold"
- size_percent: 1-10 (percentage of balance)
- If market is bearish, return []`;

  try {
    console.log('🤖 Calling AI for market pattern analysis...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a professional cryptocurrency scalp trader. Respond ONLY with valid JSON arrays, no markdown or explanations.' },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error('AI Gateway error:', response.status);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('🧠 AI Response:', content);
    
    // Parse AI response
    let aiDecisions: any[] = [];
    try {
      // Clean the response - remove markdown if present
      let cleanContent = content.trim();
      if (cleanContent.startsWith('```')) {
        cleanContent = cleanContent.replace(/```json?\n?/g, '').replace(/```/g, '');
      }
      aiDecisions = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      return [];
    }

    // Convert AI decisions to our format
    return aiDecisions.map((d: any) => {
      const coinData = marketData.find(m => m.symbol === d.symbol);
      const positionValue = balance * (d.size_percent || maxPositionSize) / 100;
      const quantity = coinData ? positionValue / coinData.price : 0;
      
      return {
        action: d.action as 'buy' | 'sell' | 'hold',
        symbol: d.symbol,
        reason: `🤖 AI: ${d.reason}`,
        confidence: d.confidence || 0.7,
        suggestedSize: quantity,
        pattern: d.pattern,
      };
    }).filter((d: AITradingDecision) => d.action !== 'hold' && d.suggestedSize > 0);
    
  } catch (error) {
    console.error('AI analysis error:', error);
    return [];
  }
}

// Detect market regime based on price action
function detectMarketRegime(marketData: MarketData[]): string {
  if (marketData.length === 0) return 'ranging';
  
  const avgChange = marketData.reduce((sum, m) => sum + m.change24h, 0) / marketData.length;
  const volatility = Math.sqrt(marketData.reduce((sum, m) => sum + Math.pow(m.change24h - avgChange, 2), 0) / marketData.length);
  
  if (volatility > 8) return 'high_volatility';
  if (volatility < 2) return 'low_volatility';
  if (avgChange > 3) return 'trending';
  if (avgChange < -3) return 'trending';
  return 'ranging';
}

// Get best strategy for current regime from performance data
async function getBestStrategyForRegime(supabase: any, userId: string, regime: string): Promise<string> {
  const { data: performance } = await supabase
    .from('strategy_performance')
    .select('strategy, score, win_rate')
    .eq('user_id', userId)
    .eq('market_regime', regime)
    .order('score', { ascending: false })
    .limit(1);
  
  if (performance && performance.length > 0) {
    console.log(`🎯 Best strategy for ${regime}: ${performance[0].strategy} (score: ${performance[0].score}, win: ${performance[0].win_rate}%)`);
    return performance[0].strategy;
  }
  
  // Fallback defaults by regime
  const defaults: Record<string, string> = {
    'trending': 'ema_crossover',
    'ranging': 'rsi',
    'high_volatility': 'volatility_breakout',
    'low_volatility': 'dca',
    'news_driven': 'custom'
  };
  return defaults[regime] || 'rsi';
}

// AGGRESSIVE rule-based analysis for maximum speed
function analyzeWithRules(
  marketData: MarketData[],
  regime: string,
  maxPositionSize: number,
  balance: number
): AITradingDecision[] {
  const decisions: AITradingDecision[] = [];
  
  for (const coin of marketData) {
    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reason = '';
    let pattern = '';
    
    const priceRange = coin.high24h - coin.low24h;
    const pricePosition = priceRange > 0 ? (coin.price - coin.low24h) / priceRange : 0.5;
    
    // AGGRESSIVE: Lower thresholds to trade more often
    if (coin.change24h > 0.1) {
      action = 'buy';
      confidence = Math.min(0.98, 0.7 + (coin.change24h / 5));
      reason = `🚀 Momentum (+${coin.change24h.toFixed(2)}%)`;
      pattern = 'momentum_breakout';
    } else if (coin.change24h < -0.2 && pricePosition < 0.5) {
      action = 'buy';
      confidence = 0.85;
      reason = `💰 Dip buy at ${(pricePosition * 100).toFixed(0)}%`;
      pattern = 'oversold_bounce';
    } else if (pricePosition < 0.35) {
      action = 'buy';
      confidence = 0.9;
      reason = `📍 Support bounce (${(pricePosition * 100).toFixed(0)}%)`;
      pattern = 'support_bounce';
    } else if (pricePosition > 0.65 && coin.change24h > 0) {
      action = 'buy';
      confidence = 0.75;
      reason = `📈 Breakout continuation (${(pricePosition * 100).toFixed(0)}%)`;
      pattern = 'breakout_continuation';
    }
    
    // Boost confidence in volatile markets
    if (regime === 'high_volatility') confidence *= 1.3;
    if (regime === 'trending') confidence *= 1.2;
    
    // AGGRESSIVE: Trade almost everything, larger positions
    if (action !== 'hold' && confidence >= 0.05) {
      // Use 5x position multiplier for speed
      const positionValue = balance * (maxPositionSize / 100) * confidence * 5;
      const quantity = positionValue / coin.price;
      
      decisions.push({
        action,
        symbol: coin.symbol,
        reason: `📊 ${reason}`,
        confidence: Math.min(confidence, 0.98),
        suggestedSize: quantity,
        pattern,
      });
    }
  }
  
  // Return top 10 trades instead of 5 for more action
  return decisions.sort((a, b) => b.confidence - a.confidence).slice(0, 10);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🤖 AI Trading Engine triggered for user: ${user.id}`);

    // Fetch user's AI settings
    const { data: settings, error: settingsError } = await supabase
      .from('ai_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError || !settings) {
      return new Response(JSON.stringify({ error: 'AI settings not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!settings.enabled) {
      return new Response(JSON.stringify({ message: 'AI trading is disabled', status: 'idle' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isPaperMode = settings.trading_mode === 'paper';

    // Get current balance
    let balance = 0;
    if (isPaperMode) {
      const { data: paperAccount } = await supabase
        .from('paper_account')
        .select('balance')
        .eq('user_id', user.id)
        .single();
      balance = paperAccount?.balance || 100000;
    } else {
      const { data: liveAccount } = await supabase
        .from('live_account')
        .select('equity')
        .eq('user_id', user.id)
        .single();
      balance = liveAccount?.equity || 0;
    }

    // Get current open positions count
    const { count: openPositions } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_paper', isPaperMode);

    if ((openPositions || 0) >= settings.max_concurrent_trades) {
      console.log('Max concurrent trades reached');
      return new Response(JSON.stringify({ 
        message: 'Max concurrent trades reached',
        openPositions,
        maxAllowed: settings.max_concurrent_trades,
        status: 'at_limit'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch market data
    const marketData = await fetchMarketData();
    if (marketData.length === 0) {
      return new Response(JSON.stringify({ error: 'Could not fetch market data', status: 'error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Detect market regime
    const regime = detectMarketRegime(marketData);
    console.log(`📊 Detected market regime: ${regime}`);

    // 📈 TREND ANALYSIS - Filter out downtrending coins
    const { tradeable, trendAnalysis } = filterByTrend(marketData);
    console.log(`📈 Trend Analysis:`);
    trendAnalysis.forEach(t => console.log(`  ${t.symbol}: ${t.trend} | Trade: ${t.shouldTrade} | ${t.reason}`));
    console.log(`✅ Tradeable coins: ${tradeable.map(c => c.symbol).join(', ') || 'NONE - All in downtrend'}`);

    // If all coins are in downtrend, skip trading entirely
    if (tradeable.length === 0) {
      console.log('⚠️ All coins in downtrend - SKIPPING TRADING');
      
      // Update AI settings with current regime
      await supabase
        .from('ai_settings')
        .update({ 
          current_regime: regime,
          bot_status: 'idle',
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      // Log the decision to skip
      await supabase.from('ai_decisions').insert({
        user_id: user.id,
        decision_type: 'market_skip',
        reasoning: `All coins in downtrend - protecting capital. Analysis: ${trendAnalysis.map(t => `${t.symbol}: ${t.trend}`).join(', ')}`,
        market_regime: regime,
      });

      return new Response(JSON.stringify({
        status: 'skipped',
        reason: 'All coins in downtrend - protecting capital',
        regime,
        trendAnalysis,
        marketData,
        balance,
        isPaperMode,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update AI settings with current regime
    await supabase
      .from('ai_settings')
      .update({ 
        current_regime: regime,
        bot_status: 'trading',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    // 🧠 AI-POWERED ANALYSIS - Only on tradeable coins
    console.log('🧠 Running AI pattern recognition on tradeable coins...');
    let decisions = await analyzeWithAI(tradeable, balance, settings.max_position_size, trendAnalysis);
    
    // Fallback to rule-based if AI returns nothing
    if (decisions.length === 0) {
      console.log('📊 AI returned no decisions, using rule-based fallback');
      decisions = analyzeWithRules(tradeable, regime, settings.max_position_size, balance);
    }

    // Double-check: Filter out any decisions for coins in downtrend (safety net)
    decisions = decisions.filter(d => {
      const trend = trendAnalysis.find(t => t.symbol === d.symbol);
      if (trend && !trend.shouldTrade) {
        console.log(`🛡️ Safety filter: Blocking ${d.action} on ${d.symbol} - in ${trend.trend}`);
        return false;
      }
      return true;
    });

    console.log(`✅ Generated ${decisions.length} trading decisions`);

    const executedTrades: any[] = [];

    // Execute trades
    for (const decision of decisions) {
      if (decision.action === 'hold') continue;
      
      const coinData = marketData.find(m => m.symbol === decision.symbol);
      if (!coinData) continue;

      // AGGRESSIVE: Larger positions for faster compounding
      const maxValue = balance * (settings.max_position_size / 100) * 5;
      const tradeValue = Math.min(maxValue * decision.confidence, maxValue);
      const quantity = tradeValue / coinData.price;

      if (tradeValue < 1) continue; // Lower minimum for more trades

      // Get best strategy from performance data for current regime
      const bestStrategy = await getBestStrategyForRegime(supabase, user.id, regime);
      const strategyType = bestStrategy;

      const tradeData = {
        user_id: user.id,
        symbol: decision.symbol,
        side: decision.action as 'buy' | 'sell',
        quantity,
        entry_price: coinData.price,
        market_type: 'crypto' as const,
        is_paper: isPaperMode,
        status: 'open' as const,
        strategy: strategyType,
        ai_reasoning: decision.reason,
      };

      const { data: trade, error: tradeError } = await supabase
        .from('trades')
        .insert(tradeData)
        .select()
        .single();

      if (tradeError) {
        console.error('Error inserting trade:', tradeError);
        continue;
      }

      // Create position
      await supabase.from('positions').insert({
        user_id: user.id,
        symbol: decision.symbol,
        side: decision.action,
        quantity,
        avg_entry_price: coinData.price,
        current_price: coinData.price,
        market_type: 'crypto',
        is_paper: isPaperMode,
        strategy: strategyType,
        unrealized_pnl: 0,
      });

      // Update paper account balance
      if (isPaperMode && decision.action === 'buy') {
        await supabase
          .from('paper_account')
          .update({ balance: balance - tradeValue, updated_at: new Date().toISOString() })
          .eq('user_id', user.id);
        balance -= tradeValue;
      }

      // Log AI decision with pattern info
      await supabase.from('ai_decisions').insert({
        user_id: user.id,
        decision_type: 'ai_trade_execution',
        symbol: decision.symbol,
        action: decision.action,
        reasoning: `${decision.reason} | Pattern: ${decision.pattern || 'N/A'} | Confidence: ${(decision.confidence * 100).toFixed(0)}%`,
        market_regime: regime,
        strategy: strategyType,
      });

      executedTrades.push({
        ...trade,
        confidence: decision.confidence,
        reason: decision.reason,
        pattern: decision.pattern,
      });

      console.log(`🎯 Executed ${decision.action} for ${decision.symbol}: ${quantity.toFixed(6)} @ $${coinData.price} | Pattern: ${decision.pattern}`);
    }

    return new Response(JSON.stringify({
      status: 'success',
      regime,
      aiPowered: decisions.some(d => d.reason.includes('🤖')),
      marketData: marketData.slice(0, 5),
      decisions,
      executedTrades,
      balance,
      isPaperMode,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('AI Trading Engine error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADVISOR_CREDIT_COST = 2;

const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  'openai/gpt-5.4': { in: 1.25, out: 10.0 },
  'openai/gpt-5-mini': { in: 0.25, out: 2.0 },
  'openai/gpt-5': { in: 1.25, out: 10.0 },
  'google/gemini-2.5-flash': { in: 0.075, out: 0.30 },
  'google/gemini-2.5-pro': { in: 1.25, out: 5.0 },
};

async function logAIUsage(sb: any, userId: string | null, fn: string, model: string, usage: any, status: string) {
  try {
    const p = MODEL_PRICES[model] || { in: 0.1, out: 0.4 };
    const inTok = usage?.prompt_tokens ?? 0;
    const outTok = usage?.completion_tokens ?? 0;
    const cost = (inTok * p.in + outTok * p.out) / 1_000_000;
    await sb.from('ai_usage_log').insert({
      user_id: userId, function_name: fn, model,
      cost_usd: Number(cost.toFixed(6)), tokens_in: inTok, tokens_out: outTok, status,
    });
  } catch (e) { console.warn('logAIUsage failed', e); }
}

async function getUserBalance(sb: any, userId: string): Promise<number> {
  const { data } = await sb.from('ai_credit_balances').select('credits').eq('user_id', userId).maybeSingle();
  return Number(data?.credits ?? 0);
}

async function deductCredits(sb: any, userId: string, amount: number, description: string) {
  const current = await getUserBalance(sb, userId);
  const next = Math.max(0, current - amount);
  await sb.from('ai_credit_balances').upsert({ user_id: userId, credits: next, updated_at: new Date().toISOString() });
  await sb.from('ai_credit_transactions').insert({
    user_id: userId, type: 'debit', delta: -amount, description,
  });
}


interface CryptoData {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  high_24h: number;
  low_24h: number;
  total_volume: number;
  market_cap: number;
}

interface AssetAnalysis {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  pricePosition: number; // 0-1 where in daily range
  volumeStrength: string;
  trend: string;
  signals: string[];
}

interface StrategyRecommendation {
  symbol: string;
  name: string;
  strategy: string;
  timeframe: string;
  confidence: number;
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  riskLevel: 'low' | 'medium' | 'high';
  reasoning: string;
  signals: { type: 'bullish' | 'bearish' | 'neutral'; text: string }[];
  price: number;
  change24h: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Fetch crypto market data
    const cryptos = 'bitcoin,ethereum,solana,cardano,ripple,dogecoin,polkadot,avalanche-2,chainlink,litecoin';
    const marketResponse = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cryptos}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
    );

    if (!marketResponse.ok) {
      throw new Error('Failed to fetch market data');
    }

    const marketData: CryptoData[] = await marketResponse.json();
    console.log(`Fetched data for ${marketData.length} assets`);

    // Analyze each asset
    const assetAnalyses: AssetAnalysis[] = marketData.map(coin => {
      const priceRange = coin.high_24h - coin.low_24h;
      const pricePosition = priceRange > 0 ? (coin.current_price - coin.low_24h) / priceRange : 0.5;
      
      let trend = 'neutral';
      if (coin.price_change_percentage_24h > 5) trend = 'strong_bullish';
      else if (coin.price_change_percentage_24h > 2) trend = 'bullish';
      else if (coin.price_change_percentage_24h < -5) trend = 'strong_bearish';
      else if (coin.price_change_percentage_24h < -2) trend = 'bearish';

      const signals: string[] = [];
      if (pricePosition < 0.2) signals.push('oversold');
      if (pricePosition > 0.8) signals.push('overbought');
      if (Math.abs(coin.price_change_percentage_24h) > 8) signals.push('high_volatility');
      if (coin.price_change_percentage_24h > 3 && pricePosition < 0.6) signals.push('momentum_breakout');
      if (coin.price_change_percentage_24h < -3 && pricePosition > 0.4) signals.push('breakdown');

      return {
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h,
        pricePosition,
        volumeStrength: coin.total_volume > 1000000000 ? 'high' : coin.total_volume > 100000000 ? 'medium' : 'low',
        trend,
        signals,
      };
    });

    // Build prompt for AI analysis
    const analysisPrompt = `You are an expert crypto trading strategist. Analyze the following cryptocurrency market data and recommend the SINGLE BEST trading opportunity right now.

Current Market Data:
${assetAnalyses.map(a => `
${a.name} (${a.symbol}):
- Price: $${a.price.toLocaleString()}
- 24h Change: ${a.change24h.toFixed(2)}%
- Position in Daily Range: ${(a.pricePosition * 100).toFixed(0)}% (0% = at low, 100% = at high)
- Trend: ${a.trend}
- Volume: ${a.volumeStrength}
- Signals: ${a.signals.length > 0 ? a.signals.join(', ') : 'none'}
`).join('')}

Available Strategies:
1. RSI Mean Reversion - Buy oversold, sell overbought
2. EMA Crossover - Trend following on momentum
3. MACD Momentum - Catch momentum shifts
4. Trend Breakout - Enter on confirmed breakouts
5. Volatility Breakout - Trade high volatility moves
6. Grid Trading - Range-bound markets
7. DCA - Gradual accumulation in uncertainty

Respond with a JSON object (no markdown, just raw JSON):
{
  "bestAsset": {
    "symbol": "SYMBOL",
    "name": "Full Name",
    "strategy": "Strategy Name",
    "timeframe": "5m/15m/1h/4h",
    "confidence": 0-100,
    "positionSize": 1-10 (percent),
    "stopLoss": 1-5 (percent),
    "takeProfit": 2-15 (percent),
    "riskLevel": "low/medium/high",
    "reasoning": "2-3 sentence explanation of why this is the best opportunity",
    "signals": [
      {"type": "bullish/bearish/neutral", "text": "Signal description"}
    ]
  },
  "marketOverview": "1-2 sentence overall market summary",
  "alternativeAssets": ["SYMBOL1", "SYMBOL2"] // 2 runner-up symbols
}`;

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5.4',
        messages: [
          { role: 'system', content: 'You are an expert cryptocurrency trading analyst. Always respond with valid JSON only, no markdown.' },
          { role: 'user', content: analysisPrompt }
        ],
        reasoning: { effort: 'medium' },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content || '';
    
    console.log('AI response:', aiContent);

    // Parse AI response
    let recommendation;
    try {
      // Clean up potential markdown formatting
      const cleanJson = aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      recommendation = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // Fallback to a simple analysis
      const bestAsset = assetAnalyses.reduce((best, current) => {
        const score = Math.abs(current.change24h) * (current.signals.length + 1);
        const bestScore = Math.abs(best.change24h) * (best.signals.length + 1);
        return score > bestScore ? current : best;
      });

      recommendation = {
        bestAsset: {
          symbol: bestAsset.symbol,
          name: bestAsset.name,
          strategy: bestAsset.change24h > 0 ? 'Trend Breakout' : 'RSI Mean Reversion',
          timeframe: '15m',
          confidence: 65,
          positionSize: 5,
          stopLoss: 2.5,
          takeProfit: 5,
          riskLevel: 'medium',
          reasoning: `${bestAsset.name} shows ${bestAsset.trend} momentum with ${bestAsset.change24h.toFixed(2)}% movement. Currently at ${(bestAsset.pricePosition * 100).toFixed(0)}% of daily range.`,
          signals: [
            { type: bestAsset.change24h > 0 ? 'bullish' : 'bearish', text: `24h change: ${bestAsset.change24h.toFixed(2)}%` },
            { type: 'neutral', text: `Volume strength: ${bestAsset.volumeStrength}` },
          ],
        },
        marketOverview: 'Market analysis based on technical indicators.',
        alternativeAssets: assetAnalyses.slice(1, 3).map(a => a.symbol),
      };
    }

    // Enrich with price data
    const assetData = assetAnalyses.find(a => a.symbol === recommendation.bestAsset.symbol);
    if (assetData) {
      recommendation.bestAsset.price = assetData.price;
      recommendation.bestAsset.change24h = assetData.change24h;
    }

    return new Response(JSON.stringify({
      success: true,
      recommendation: recommendation.bestAsset,
      marketOverview: recommendation.marketOverview,
      alternativeAssets: recommendation.alternativeAssets,
      allAssets: assetAnalyses.map(a => ({
        symbol: a.symbol,
        name: a.name,
        price: a.price,
        change24h: a.change24h,
        trend: a.trend,
      })),
      analyzedAt: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Strategy advisor error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

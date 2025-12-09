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

interface TradingDecision {
  action: 'buy' | 'sell' | 'hold';
  symbol: string;
  reason: string;
  confidence: number;
  suggestedSize: number;
}

// Fetch current crypto prices from CoinGecko
async function fetchMarketData(): Promise<MarketData[]> {
  const cryptos = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple', 'dogecoin', 'polkadot', 'avalanche-2'];
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cryptos.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error('CoinGecko API error:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data.map((coin: any) => ({
      symbol: coin.symbol.toUpperCase(),
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h || 0,
      volume: coin.total_volume,
      high24h: coin.high_24h,
      low24h: coin.low_24h,
    }));
  } catch (error) {
    console.error('Error fetching market data:', error);
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

// Simple trading strategy based on momentum and RSI-like logic
function analyzeForTrades(
  marketData: MarketData[],
  regime: string,
  maxPositionSize: number,
  balance: number
): TradingDecision[] {
  const decisions: TradingDecision[] = [];
  
  for (const coin of marketData) {
    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reason = '';
    
    // Price relative to daily range (pseudo-RSI)
    const priceRange = coin.high24h - coin.low24h;
    const pricePosition = priceRange > 0 ? (coin.price - coin.low24h) / priceRange : 0.5;
    
    // Momentum-based strategy
    if (regime === 'trending') {
      if (coin.change24h > 5 && pricePosition < 0.7) {
        action = 'buy';
        confidence = Math.min(0.8, coin.change24h / 10);
        reason = `Strong uptrend (+${coin.change24h.toFixed(1)}%), catching momentum`;
      } else if (coin.change24h < -5 && pricePosition > 0.3) {
        action = 'sell';
        confidence = Math.min(0.7, Math.abs(coin.change24h) / 10);
        reason = `Downtrend detected (${coin.change24h.toFixed(1)}%), reducing exposure`;
      }
    }
    
    // Mean reversion in ranging market
    if (regime === 'ranging') {
      if (pricePosition < 0.2 && coin.change24h < -2) {
        action = 'buy';
        confidence = 0.6;
        reason = `Oversold in range (at ${(pricePosition * 100).toFixed(0)}% of daily range)`;
      } else if (pricePosition > 0.8 && coin.change24h > 2) {
        action = 'sell';
        confidence = 0.6;
        reason = `Overbought in range (at ${(pricePosition * 100).toFixed(0)}% of daily range)`;
      }
    }
    
    // Volatility breakout
    if (regime === 'high_volatility') {
      if (coin.change24h > 8) {
        action = 'buy';
        confidence = 0.5;
        reason = `Volatility breakout to upside (+${coin.change24h.toFixed(1)}%)`;
      }
    }
    
    // DCA in low volatility
    if (regime === 'low_volatility') {
      if (coin.change24h < -1 && confidence === 0) {
        action = 'buy';
        confidence = 0.4;
        reason = `DCA opportunity in low volatility`;
      }
    }
    
    if (action !== 'hold' && confidence > 0.3) {
      const positionValue = balance * (maxPositionSize / 100) * confidence;
      const quantity = positionValue / coin.price;
      
      decisions.push({
        action,
        symbol: coin.symbol,
        reason,
        confidence,
        suggestedSize: quantity,
      });
    }
  }
  
  return decisions.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authorization header to identify user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`AI Trading Engine triggered for user: ${user.id}`);

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

    // Check if AI trading is enabled
    if (!settings.enabled) {
      return new Response(JSON.stringify({ 
        message: 'AI trading is disabled',
        status: 'idle'
      }), {
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
      return new Response(JSON.stringify({ 
        error: 'Could not fetch market data',
        status: 'error'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Detect market regime
    const regime = detectMarketRegime(marketData);
    console.log(`Detected market regime: ${regime}`);

    // Update AI settings with current regime
    await supabase
      .from('ai_settings')
      .update({ 
        current_regime: regime,
        bot_status: 'trading',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id);

    // Analyze market for trading opportunities
    const decisions = analyzeForTrades(
      marketData,
      regime,
      settings.max_position_size,
      balance
    );

    console.log(`Generated ${decisions.length} trading decisions`);

    const executedTrades: any[] = [];

    // Execute trades (paper mode only for now)
    for (const decision of decisions) {
      if (decision.action === 'hold') continue;
      
      const coinData = marketData.find(m => m.symbol === decision.symbol);
      if (!coinData) continue;

      // Calculate position size respecting limits
      const maxValue = balance * (settings.max_position_size / 100);
      const tradeValue = Math.min(maxValue * decision.confidence, maxValue);
      const quantity = tradeValue / coinData.price;

      if (tradeValue < 10) continue; // Skip tiny trades

      // Record the trade
      const tradeData = {
        user_id: user.id,
        symbol: decision.symbol,
        side: decision.action as 'buy' | 'sell',
        quantity,
        entry_price: coinData.price,
        market_type: 'crypto' as const,
        is_paper: isPaperMode,
        status: 'open' as const,
        strategy: regime === 'trending' ? 'trend_breakout' : 
                  regime === 'ranging' ? 'rsi' : 
                  regime === 'high_volatility' ? 'volatility_breakout' : 'dca',
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
      const { error: posError } = await supabase
        .from('positions')
        .insert({
          user_id: user.id,
          symbol: decision.symbol,
          side: decision.action,
          quantity,
          avg_entry_price: coinData.price,
          current_price: coinData.price,
          market_type: 'crypto',
          is_paper: isPaperMode,
          strategy: tradeData.strategy,
          unrealized_pnl: 0,
        });

      if (posError) {
        console.error('Error inserting position:', posError);
      }

      // Update paper account balance
      if (isPaperMode && decision.action === 'buy') {
        await supabase
          .from('paper_account')
          .update({ 
            balance: balance - tradeValue,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', user.id);
        balance -= tradeValue;
      }

      // Log AI decision
      await supabase
        .from('ai_decisions')
        .insert({
          user_id: user.id,
          decision_type: 'trade_execution',
          symbol: decision.symbol,
          action: decision.action,
          reasoning: `${decision.reason} | Confidence: ${(decision.confidence * 100).toFixed(0)}%`,
          market_regime: regime,
          strategy: tradeData.strategy,
        });

      executedTrades.push({
        ...trade,
        confidence: decision.confidence,
        reason: decision.reason,
      });

      console.log(`Executed ${decision.action} for ${decision.symbol}: ${quantity.toFixed(6)} @ $${coinData.price}`);
    }

    return new Response(JSON.stringify({
      status: 'success',
      regime,
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

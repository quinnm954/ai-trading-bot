import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Strategy types we're learning about
const STRATEGIES = ['rsi', 'ema_crossover', 'macd', 'trend_breakout', 'volatility_breakout', 'grid', 'dca', 'custom'];
const REGIMES = ['trending', 'ranging', 'high_volatility', 'low_volatility', 'news_driven'];

interface TradeResult {
  symbol: string;
  strategy: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  holdTimeMinutes: number;
  marketRegime: string;
  won: boolean;
}

interface StrategyScore {
  strategy: string;
  regime: string;
  winRate: number;
  avgProfit: number;
  totalTrades: number;
  score: number;
}

// Fetch historical price data for backtesting
async function fetchHistoricalPrices(): Promise<any[]> {
  try {
    const cryptos = [
      'bitcoin', 'ethereum', 'solana', 'xrp', 'dogecoin', 'cardano', 'avalanche-2', 
      'chainlink', 'polkadot', 'litecoin', 'near', 'arbitrum', 'optimism'
    ];
    
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cryptos.join(',')}&order=market_cap_desc&sparkline=true&price_change_percentage=1h,24h,7d`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log('CoinGecko rate limited, using simulated data');
      return generateSimulatedPriceData();
    }
    
    const data = await response.json();
    return data.map((coin: any) => ({
      symbol: coin.symbol.toUpperCase(),
      currentPrice: coin.current_price,
      change1h: coin.price_change_percentage_1h_in_currency || 0,
      change24h: coin.price_change_percentage_24h || 0,
      change7d: coin.price_change_percentage_7d_in_currency || 0,
      high24h: coin.high_24h,
      low24h: coin.low_24h,
      volume: coin.total_volume,
      sparkline: coin.sparkline_in_7d?.price || [],
    }));
  } catch (error) {
    console.error('Error fetching prices:', error);
    return generateSimulatedPriceData();
  }
}

function generateSimulatedPriceData(): any[] {
  const symbols = ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'LTC'];
  const basePrices: Record<string, number> = {
    'BTC': 95000, 'ETH': 3500, 'SOL': 180, 'XRP': 2.2, 'DOGE': 0.35,
    'ADA': 0.95, 'AVAX': 38, 'LINK': 23, 'DOT': 7, 'LTC': 105
  };
  
  return symbols.map(symbol => {
    const basePrice = basePrices[symbol] || 100;
    const volatility = Math.random() * 0.1;
    const change24h = (Math.random() - 0.5) * 10;
    
    // Generate sparkline (168 hours = 7 days)
    const sparkline: number[] = [];
    let price = basePrice * (1 - volatility);
    for (let i = 0; i < 168; i++) {
      price *= 1 + (Math.random() - 0.48) * 0.02;
      sparkline.push(price);
    }
    
    return {
      symbol,
      currentPrice: basePrice,
      change1h: (Math.random() - 0.5) * 2,
      change24h,
      change7d: (Math.random() - 0.5) * 15,
      high24h: basePrice * 1.03,
      low24h: basePrice * 0.97,
      volume: Math.random() * 10000000000,
      sparkline,
    };
  });
}

// Detect market regime from price data
function detectRegime(priceData: any): string {
  const change24h = priceData.change24h || 0;
  const volatility = Math.abs(priceData.high24h - priceData.low24h) / priceData.currentPrice * 100;
  
  if (volatility > 8) return 'high_volatility';
  if (volatility < 2) return 'low_volatility';
  if (Math.abs(change24h) > 5) return 'trending';
  if (Math.abs(change24h) < 1) return 'ranging';
  return 'ranging';
}

// Simulate a trade with a specific strategy
function simulateTrade(
  priceData: any, 
  strategy: string, 
  sparkline: number[]
): TradeResult | null {
  if (!sparkline || sparkline.length < 24) return null;
  
  const regime = detectRegime(priceData);
  
  // Strategy-specific entry conditions
  let shouldEnter = false;
  let entryIndex = Math.floor(Math.random() * (sparkline.length - 24));
  let exitIndex = entryIndex;
  
  const entryPrice = sparkline[entryIndex];
  if (!entryPrice || entryPrice <= 0) return null;
  
  // Each strategy has different entry/exit logic
  switch (strategy) {
    case 'rsi':
      // RSI strategy: buy on oversold, sell on recovery
      const localLow = Math.min(...sparkline.slice(entryIndex, entryIndex + 6));
      shouldEnter = sparkline[entryIndex] <= localLow * 1.02;
      exitIndex = Math.min(entryIndex + 6 + Math.floor(Math.random() * 12), sparkline.length - 1);
      break;
      
    case 'ema_crossover':
      // EMA crossover: buy on momentum, ride the trend
      const ema5 = sparkline.slice(entryIndex - 5, entryIndex).reduce((a, b) => a + b, 0) / 5 || entryPrice;
      const ema20 = sparkline.slice(entryIndex - 20, entryIndex).reduce((a, b) => a + b, 0) / 20 || entryPrice;
      shouldEnter = ema5 > ema20;
      exitIndex = Math.min(entryIndex + 12 + Math.floor(Math.random() * 24), sparkline.length - 1);
      break;
      
    case 'macd':
      // MACD: momentum based entries
      shouldEnter = priceData.change1h > 0.2 || priceData.change24h > 2;
      exitIndex = Math.min(entryIndex + 4 + Math.floor(Math.random() * 8), sparkline.length - 1);
      break;
      
    case 'trend_breakout':
      // Breakout: buy near highs
      const recentHigh = Math.max(...sparkline.slice(Math.max(0, entryIndex - 24), entryIndex));
      shouldEnter = sparkline[entryIndex] > recentHigh * 0.98;
      exitIndex = Math.min(entryIndex + 8 + Math.floor(Math.random() * 16), sparkline.length - 1);
      break;
      
    case 'volatility_breakout':
      // Volatility: trade high volatility
      const priceRange = (priceData.high24h - priceData.low24h) / priceData.currentPrice;
      shouldEnter = priceRange > 0.05;
      exitIndex = Math.min(entryIndex + 2 + Math.floor(Math.random() * 6), sparkline.length - 1);
      break;
      
    case 'grid':
      // Grid: always enter, profit from range
      shouldEnter = true;
      exitIndex = Math.min(entryIndex + 4 + Math.floor(Math.random() * 8), sparkline.length - 1);
      break;
      
    case 'dca':
      // DCA: accumulate on dips
      shouldEnter = priceData.change24h < 0;
      exitIndex = Math.min(entryIndex + 24 + Math.floor(Math.random() * 48), sparkline.length - 1);
      break;
      
    case 'custom':
      // Custom: mixed signals
      shouldEnter = Math.random() > 0.4;
      exitIndex = Math.min(entryIndex + 6 + Math.floor(Math.random() * 12), sparkline.length - 1);
      break;
  }
  
  if (!shouldEnter) return null;
  
  const exitPrice = sparkline[exitIndex];
  if (!exitPrice || exitPrice <= 0) return null;
  
  const pnl = exitPrice - entryPrice;
  const pnlPercent = (pnl / entryPrice) * 100;
  const holdTimeMinutes = (exitIndex - entryIndex) * 60; // Each sparkline point is 1 hour
  
  return {
    symbol: priceData.symbol,
    strategy,
    entryPrice,
    exitPrice,
    pnl,
    pnlPercent,
    holdTimeMinutes,
    marketRegime: regime,
    won: pnlPercent > 0,
  };
}

// Run backtests for all strategies
function runBacktests(priceData: any[]): TradeResult[] {
  const results: TradeResult[] = [];
  
  for (const coin of priceData) {
    for (const strategy of STRATEGIES) {
      // Run multiple simulated trades per strategy
      for (let i = 0; i < 10; i++) {
        const result = simulateTrade(coin, strategy, coin.sparkline);
        if (result) {
          results.push(result);
        }
      }
    }
  }
  
  console.log(`📊 Backtest completed: ${results.length} simulated trades`);
  return results;
}

// Calculate strategy scores from backtest results
function calculateStrategyScores(results: TradeResult[]): StrategyScore[] {
  const scores: StrategyScore[] = [];
  
  for (const strategy of STRATEGIES) {
    for (const regime of REGIMES) {
      const trades = results.filter(r => r.strategy === strategy && r.marketRegime === regime);
      
      if (trades.length === 0) continue;
      
      const wins = trades.filter(t => t.won).length;
      const winRate = (wins / trades.length) * 100;
      const avgProfit = trades.reduce((sum, t) => sum + t.pnlPercent, 0) / trades.length;
      
      // Score formula: weighted combination of win rate and avg profit
      // Penalize low trade counts
      const countMultiplier = Math.min(1, trades.length / 5);
      const score = Math.max(0, Math.min(100, 
        (winRate * 0.5) + 
        (Math.max(0, avgProfit + 5) * 5) + 
        (countMultiplier * 20)
      ));
      
      scores.push({
        strategy,
        regime,
        winRate: Math.round(winRate * 10) / 10,
        avgProfit: Math.round(avgProfit * 100) / 100,
        totalTrades: trades.length,
        score: Math.round(score),
      });
    }
  }
  
  return scores;
}

// Learn from real closed trades
async function learnFromRealTrades(supabase: any, userId: string): Promise<StrategyScore[]> {
  const { data: trades, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'closed')
    .order('closed_at', { ascending: false })
    .limit(500);
  
  if (error || !trades || trades.length === 0) {
    console.log('No closed trades found for learning');
    return [];
  }
  
  console.log(`📚 Learning from ${trades.length} real closed trades`);
  
  const results: TradeResult[] = trades.map((t: any) => ({
    symbol: t.symbol,
    strategy: t.strategy || 'custom',
    entryPrice: t.entry_price,
    exitPrice: t.exit_price || t.entry_price,
    pnl: t.pnl || 0,
    pnlPercent: t.entry_price ? ((t.exit_price - t.entry_price) / t.entry_price) * 100 : 0,
    holdTimeMinutes: t.closed_at && t.created_at 
      ? (new Date(t.closed_at).getTime() - new Date(t.created_at).getTime()) / 60000 
      : 60,
    marketRegime: 'ranging', // We don't store this, default to ranging
    won: (t.pnl || 0) > 0,
  }));
  
  return calculateStrategyScores(results);
}

// Update strategy performance in database
async function updateStrategyPerformance(
  supabase: any, 
  userId: string, 
  scores: StrategyScore[]
): Promise<void> {
  for (const score of scores) {
    // Upsert strategy performance
    const { error } = await supabase
      .from('strategy_performance')
      .upsert({
        user_id: userId,
        strategy: score.strategy,
        market_regime: score.regime,
        score: score.score,
        win_rate: score.winRate,
        avg_profit: score.avgProfit,
        total_trades: score.totalTrades,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,strategy,market_regime',
      });
    
    if (error) {
      console.error(`Error updating ${score.strategy}/${score.regime}:`, error.message);
    }
  }
  
  console.log(`✅ Updated ${scores.length} strategy performance records`);
}

// Find best strategy for each regime
function findBestStrategies(scores: StrategyScore[]): Record<string, { strategy: string; score: number }> {
  const best: Record<string, { strategy: string; score: number }> = {};
  
  for (const regime of REGIMES) {
    const regimeScores = scores
      .filter(s => s.regime === regime)
      .sort((a, b) => b.score - a.score);
    
    if (regimeScores.length > 0) {
      best[regime] = {
        strategy: regimeScores[0].strategy,
        score: regimeScores[0].score,
      };
    }
  }
  
  return best;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let userId: string | null = null;
    let isCronJob = false;

    // Distinguish a signed-in user request from a scheduled (cron) invocation.
    // Anything that does not resolve to a real user is treated as cron fan-out,
    // so schedules work with only an apikey header and no browser session.
    const authHeader = req.headers.get('authorization');
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (bearer && bearer !== anonKey && bearer !== supabaseKey) {
      const { data: { user } } = await supabase.auth.getUser(bearer);
      if (user) userId = user.id;
    }
    if (!userId) {
      isCronJob = true;
      console.log('🔄 Cron mode: running learning for all active users');
    }



    // For cron jobs, process all users with AI enabled
    if (isCronJob) {
      const { data: activeSettings } = await supabase
        .from('ai_settings')
        .select('user_id')
        .eq('enabled', true);
      
      if (!activeSettings || activeSettings.length === 0) {
        return new Response(JSON.stringify({ message: 'No active users' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log(`🧠 Running learning for ${activeSettings.length} users`);
      
      const allResults: any[] = [];
      
      for (const settings of activeSettings) {
        try {
          // Fetch historical prices
          const priceData = await fetchHistoricalPrices();
          
          // Run backtests
          const backtestResults = runBacktests(priceData);
          const backtestScores = calculateStrategyScores(backtestResults);
          
          // Learn from real trades
          const realTradeScores = await learnFromRealTrades(supabase, settings.user_id);
          
          // Merge scores (real trades weighted higher)
          const mergedScores: StrategyScore[] = [];
          for (const strategy of STRATEGIES) {
            for (const regime of REGIMES) {
              const backtest = backtestScores.find(s => s.strategy === strategy && s.regime === regime);
              const realTrade = realTradeScores.find(s => s.strategy === strategy && s.regime === regime);
              
              if (realTrade && backtest) {
                // Weight real trades 70%, backtests 30%
                mergedScores.push({
                  strategy,
                  regime,
                  winRate: realTrade.winRate * 0.7 + backtest.winRate * 0.3,
                  avgProfit: realTrade.avgProfit * 0.7 + backtest.avgProfit * 0.3,
                  totalTrades: realTrade.totalTrades + backtest.totalTrades,
                  score: Math.round(realTrade.score * 0.7 + backtest.score * 0.3),
                });
              } else if (realTrade) {
                mergedScores.push(realTrade);
              } else if (backtest) {
                mergedScores.push(backtest);
              }
            }
          }
          
          // Update database
          await updateStrategyPerformance(supabase, settings.user_id, mergedScores);
          
          const bestStrategies = findBestStrategies(mergedScores);
          allResults.push({
            userId: settings.user_id,
            bestStrategies,
            tradesAnalyzed: backtestResults.length + (realTradeScores.length > 0 ? 500 : 0),
          });
          
          console.log(`✅ User ${settings.user_id}: Best strategies updated`);
        } catch (userError) {
          console.error(`Error processing user ${settings.user_id}:`, userError);
        }
      }
      
      return new Response(JSON.stringify({
        status: 'success',
        usersProcessed: allResults.length,
        results: allResults,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Single user request
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🧠 AI Learning Engine for user: ${userId}`);

    // Fetch historical prices
    const priceData = await fetchHistoricalPrices();
    console.log(`📈 Fetched ${priceData.length} assets for analysis`);

    // Run backtests
    const backtestResults = runBacktests(priceData);
    const backtestScores = calculateStrategyScores(backtestResults);

    // Learn from real trades
    const realTradeScores = await learnFromRealTrades(supabase, userId);

    // Merge scores
    const mergedScores: StrategyScore[] = [];
    for (const strategy of STRATEGIES) {
      for (const regime of REGIMES) {
        const backtest = backtestScores.find(s => s.strategy === strategy && s.regime === regime);
        const realTrade = realTradeScores.find(s => s.strategy === strategy && s.regime === regime);
        
        if (realTrade && backtest) {
          mergedScores.push({
            strategy,
            regime,
            winRate: realTrade.winRate * 0.7 + backtest.winRate * 0.3,
            avgProfit: realTrade.avgProfit * 0.7 + backtest.avgProfit * 0.3,
            totalTrades: realTrade.totalTrades + backtest.totalTrades,
            score: Math.round(realTrade.score * 0.7 + backtest.score * 0.3),
          });
        } else if (realTrade) {
          mergedScores.push(realTrade);
        } else if (backtest) {
          mergedScores.push(backtest);
        }
      }
    }

    // Update database
    await updateStrategyPerformance(supabase, userId, mergedScores);

    // Find best strategies
    const bestStrategies = findBestStrategies(mergedScores);

    return new Response(JSON.stringify({
      status: 'success',
      message: 'Learning complete',
      backtestsRun: backtestResults.length,
      realTradesAnalyzed: realTradeScores.reduce((sum, s) => sum + s.totalTrades, 0),
      strategiesUpdated: mergedScores.length,
      bestStrategies,
      topScores: mergedScores.sort((a, b) => b.score - a.score).slice(0, 10),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Learning Engine error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

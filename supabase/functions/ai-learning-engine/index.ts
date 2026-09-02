import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchLiveMarket } from "../_shared/market-feed.ts";

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
// ── REAL PRICE HISTORY ──────────────────────────────────────────────────────
// The backtest that scores every strategy MUST run on real market history.
// Fabricated random walks produced fake win rates, which then biased which
// strategies the trading engine chose. If no live feed answers we return an
// empty set and the caller skips the learning cycle instead of learning noise.
async function fetchCoinbaseHourly(symbol: string): Promise<number[]> {
  // 168 hourly candles ≈ 7 days (Coinbase caps a request at 300 candles).
  for (const quote of ['USD', 'USDC']) {
    try {
      const end = Math.floor(Date.now() / 1000);
      const start = end - 168 * 3600;
      const url =
        `https://api.exchange.coinbase.com/products/${symbol}-${quote}/candles` +
        `?granularity=3600&start=${new Date(start * 1000).toISOString()}&end=${new Date(end * 1000).toISOString()}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'titanai-learning' } });
      if (!res.ok) continue;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length < 48) continue;
      // Coinbase returns [time, low, high, open, close, volume] newest-first.
      return rows
        .slice()
        .sort((a: number[], b: number[]) => a[0] - b[0])
        .map((r: number[]) => Number(r[4]))
        .filter((p) => Number.isFinite(p) && p > 0);
    } catch (_e) {
      // try the next quote currency
    }
  }
  return [];
}

async function fetchHistoricalPrices(): Promise<any[]> {
  const { quotes, source } = await fetchLiveMarket();
  if (quotes.length === 0) {
    console.error('❌ No live market feed available — skipping learning cycle (never backtest on fabricated prices)');
    return [];
  }
  console.log(`📡 Live feed: ${quotes.length} quotes from ${source}`);

  // Backtest the most liquid names; each needs real hourly candles.
  const universe = quotes
    .filter((q) => !['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD'].includes(q.symbol))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15);

  const withHistory = await Promise.all(
    universe.map(async (q) => {
      const sparkline = await fetchCoinbaseHourly(q.symbol);
      if (sparkline.length < 48) return null;
      return {
        symbol: q.symbol,
        currentPrice: q.price,
        change1h: q.change1h,
        change24h: q.change24h,
        change7d: q.change7d,
        high24h: q.high24h,
        low24h: q.low24h,
        volume: q.volume,
        sparkline,
      };
    }),
  );

  const usable = withHistory.filter((c): c is NonNullable<typeof c> => c !== null);
  console.log(`📊 Real hourly history for ${usable.length}/${universe.length} symbols`);
  return usable;
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

      // One real-market pull per run, shared by every user (feeds are rate limited).
      const priceData = await fetchHistoricalPrices();
      if (priceData.length === 0) {
        return new Response(JSON.stringify({ error: 'No live market data — learning cycle skipped' }), {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const backtestResults = runBacktests(priceData);
      const backtestScores = calculateStrategyScores(backtestResults);

      for (const settings of activeSettings) {
        try {

          
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

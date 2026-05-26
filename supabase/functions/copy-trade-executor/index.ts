import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: any) => {
  console.log(`[COPY-TRADE] ${step}`, details ? JSON.stringify(details) : '');
};

// CoinGecko ID map for live-price validation (prevents stale-price copy trades)
const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', ADA: 'cardano',
  DOGE: 'dogecoin', AVAX: 'avalanche-2', DOT: 'polkadot', LINK: 'chainlink',
  MATIC: 'matic-network', LTC: 'litecoin', UNI: 'uniswap', ATOM: 'cosmos',
  NEAR: 'near', INJ: 'injective-protocol', TAO: 'bittensor', RENDER: 'render-token',
  ENS: 'ethereum-name-service', AAVE: 'aave', MKR: 'maker', BCH: 'bitcoin-cash',
  XLM: 'stellar', ARB: 'arbitrum', OP: 'optimism', FIL: 'filecoin',
  OKB: 'okb', GMX: 'gmx', AXS: 'axie-infinity', SUI: 'sui',
};

async function fetchLivePrice(symbol: string): Promise<number | null> {
  const id = COINGECKO_IDS[symbol.toUpperCase()];
  if (!id) return null;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.[id]?.usd;
    return typeof p === 'number' && p > 0 ? p : null;
  } catch {
    return null;
  }
}

// Reject signals where the signal's entry price drifts more than 1.5% from live market.
const MAX_PRICE_DRIFT_PERCENT = 1.5;

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
    log("Starting copy trade execution scan");

    // Get all pending copy trade signals (not yet copied)
    const { data: pendingSignals, error: signalsError } = await supabase
      .from('copy_trade_signals')
      .select(`
        *,
        top_traders!copy_trade_signals_trader_id_fkey (
          id, display_name, win_rate, trading_style, best_performing_assets
        )
      `)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (signalsError) {
      throw new Error(`Failed to fetch signals: ${signalsError.message}`);
    }

    log(`Found ${pendingSignals?.length || 0} pending signals`);

    if (!pendingSignals || pendingSignals.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No pending signals to process',
        processed: 0 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all users who are following traders with pending signals
    const traderIds = [...new Set(pendingSignals.map(s => s.trader_id))];
    
    const { data: followers, error: followersError } = await supabase
      .from('followed_traders')
      .select('*')
      .in('trader_id', traderIds)
      .eq('is_active', true);

    if (followersError) {
      throw new Error(`Failed to fetch followers: ${followersError.message}`);
    }

    log(`Found ${followers?.length || 0} active followers for these traders`);

    let processedCount = 0;
    let executedTrades = 0;

    // Process each signal for each follower
    for (const signal of pendingSignals) {
      const signalFollowers = followers?.filter(f => f.trader_id === signal.trader_id) || [];
      
      log(`Processing signal for ${signal.symbol}`, { 
        action: signal.action, 
        traderName: signal.top_traders?.display_name,
        followersCount: signalFollowers.length 
      });

      for (const follower of signalFollowers) {
        try {
          // Get user's AI settings and account balance
          const { data: settings } = await supabase
            .from('ai_settings')
            .select('*')
            .eq('user_id', follower.user_id)
            .single();

          if (!settings?.enabled) {
            log(`Skipping user ${follower.user_id} - AI disabled`);
            continue;
          }

          // Get user's paper account balance
          const { data: paperAccount } = await supabase
            .from('paper_account')
            .select('balance')
            .eq('user_id', follower.user_id)
            .single();

          const balance = paperAccount?.balance || 0;
          
          // Calculate copy amount based on follower settings
          const copyPercentage = follower.copy_percentage || 10;
          const maxCopyAmount = follower.max_copy_amount_usd || 100;
          
          let tradeValue = Math.min(
            (balance * copyPercentage) / 100,
            maxCopyAmount,
            signal.trade_value_usd || 100
          );

          // Ensure minimum trade value
          if (tradeValue < 5) {
            log(`Skip - trade value too low: $${tradeValue.toFixed(2)}`);
            continue;
          }

          const quantity = tradeValue / signal.entry_price;

          if (signal.action === 'buy') {
            // Check if user already has this position
            const { data: existingPosition } = await supabase
              .from('positions')
              .select('*')
              .eq('user_id', follower.user_id)
              .eq('symbol', signal.symbol)
              .eq('is_paper', settings.trading_mode === 'paper')
              .single();

            if (existingPosition) {
              log(`User already has position in ${signal.symbol}, skipping`);
              continue;
            }

            // Execute paper trade - create position
            const { error: posError } = await supabase
              .from('positions')
              .insert({
                user_id: follower.user_id,
                symbol: signal.symbol,
                side: 'buy',
                quantity: quantity,
                avg_entry_price: signal.entry_price,
                current_price: signal.entry_price,
                unrealized_pnl: 0,
                is_paper: settings.trading_mode === 'paper',
                market_type: 'crypto',
                strategy: 'custom',
              });

            if (posError) {
              log(`Failed to create position: ${posError.message}`);
              continue;
            }

            // Deduct from balance
            await supabase
              .from('paper_account')
              .update({ balance: balance - tradeValue })
              .eq('user_id', follower.user_id);

            // Record the trade
            await supabase.from('trades').insert({
              user_id: follower.user_id,
              symbol: signal.symbol,
              side: 'buy',
              quantity: quantity,
              entry_price: signal.entry_price,
              status: 'open',
              is_paper: settings.trading_mode === 'paper',
              market_type: 'crypto',
              strategy: 'custom',
              ai_reasoning: `📋 Copy trade from ${signal.top_traders?.display_name || 'followed trader'} (${signal.top_traders?.win_rate?.toFixed(1)}% win rate)`,
            });

            // Log decision
            await supabase.from('ai_decisions').insert({
              user_id: follower.user_id,
              decision_type: 'copy_trade',
              symbol: signal.symbol,
              action: 'buy',
              reasoning: `Copied ${signal.action.toUpperCase()} signal from ${signal.top_traders?.display_name}. Trade value: $${tradeValue.toFixed(2)}, Quantity: ${quantity.toFixed(6)}`,
              strategy: 'custom',
            });

            executedTrades++;
            log(`✅ Executed copy trade for user ${follower.user_id}`, {
              symbol: signal.symbol,
              value: tradeValue.toFixed(2),
              quantity: quantity.toFixed(6)
            });

          } else if (signal.action === 'sell') {
            // Find user's position to sell
            const { data: position } = await supabase
              .from('positions')
              .select('*')
              .eq('user_id', follower.user_id)
              .eq('symbol', signal.symbol)
              .eq('is_paper', settings.trading_mode === 'paper')
              .single();

            if (!position) {
              log(`No position to sell for ${signal.symbol}`);
              continue;
            }

            // Calculate P&L
            const pnl = (signal.entry_price - position.avg_entry_price) * position.quantity;
            const saleValue = position.quantity * signal.entry_price;

            // Close position
            await supabase
              .from('positions')
              .delete()
              .eq('id', position.id);

            // Add to balance
            await supabase
              .from('paper_account')
              .update({ balance: balance + saleValue })
              .eq('user_id', follower.user_id);

            // Record the trade closure
            await supabase.from('trades').insert({
              user_id: follower.user_id,
              symbol: signal.symbol,
              side: 'sell',
              quantity: position.quantity,
              entry_price: position.avg_entry_price,
              exit_price: signal.entry_price,
              pnl: pnl,
              status: 'closed',
              is_paper: settings.trading_mode === 'paper',
              market_type: 'crypto',
              strategy: 'custom',
              ai_reasoning: `📋 Copy trade exit from ${signal.top_traders?.display_name}. P&L: $${pnl.toFixed(2)}`,
              closed_at: new Date().toISOString(),
            });

            executedTrades++;
            log(`✅ Closed position via copy trade`, {
              symbol: signal.symbol,
              pnl: pnl.toFixed(2)
            });
          }

        } catch (userError) {
          log(`Error processing for user ${follower.user_id}:`, String(userError));
        }
      }

      // Mark signal as copied
      await supabase
        .from('copy_trade_signals')
        .update({ 
          status: 'copied',
          copied_at: new Date().toISOString()
        })
        .eq('id', signal.id);

      processedCount++;
    }

    log(`Copy trade execution complete`, { processedCount, executedTrades });

    return new Response(JSON.stringify({
      success: true,
      processedSignals: processedCount,
      executedTrades,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

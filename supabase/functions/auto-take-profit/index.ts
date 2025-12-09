import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Take profit threshold - ultra-fast scalping at 0.15%
const TAKE_PROFIT_PERCENT = 0.15;
// Stop loss threshold (negative value) - tighter for risk management
const STOP_LOSS_PERCENT = -0.25;

// Equity target - close all positions and withdraw when reached
const EQUITY_TARGET = 200000;
const WITHDRAWAL_AMOUNT = 100000;

// Symbol mapping for CoinGecko API
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'XRP': 'ripple',
  'DOGE': 'dogecoin',
  'ADA': 'cardano',
  'AVAX': 'avalanche-2',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'LINK': 'chainlink',
};

async function fetchLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  const ids = symbols
    .map(s => SYMBOL_TO_COINGECKO[s.toUpperCase()])
    .filter(Boolean);
  
  if (ids.length === 0) return prices;
  
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
    );
    
    if (response.ok) {
      const data = await response.json();
      for (const symbol of symbols) {
        const geckoId = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
        if (geckoId && data[geckoId]?.usd) {
          prices[symbol.toUpperCase()] = data[geckoId].usd;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching prices:', error);
  }
  
  return prices;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authorization header
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

    console.log(`Auto take-profit/stop-loss check for user: ${user.id}`);

    // Get user's AI settings to check trading mode
    const { data: settings } = await supabase
      .from('ai_settings')
      .select('trading_mode')
      .eq('user_id', user.id)
      .single();

    const isPaperMode = settings?.trading_mode === 'paper';

    // Fetch all open positions
    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_paper', isPaperMode);

    if (posError) {
      console.error('Error fetching positions:', posError);
      throw posError;
    }

    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No open positions',
        closedCount: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch live prices for all position symbols
    const symbols = [...new Set(positions.map(p => p.symbol))];
    const livePrices = await fetchLivePrices(symbols);
    
    console.log('Live prices:', livePrices);

    // Get paper account balance
    const { data: paperAccount } = await supabase
      .from('paper_account')
      .select('balance, initial_balance')
      .eq('user_id', user.id)
      .single();

    const cashBalance = paperAccount?.balance || 0;

    // Calculate total equity (cash + position values)
    let totalPositionValue = 0;
    for (const position of positions) {
      const currentPrice = livePrices[position.symbol.toUpperCase()] || position.current_price;
      if (currentPrice) {
        totalPositionValue += currentPrice * Number(position.quantity);
      }
    }
    const totalEquity = cashBalance + totalPositionValue;
    console.log(`💰 Total Equity: $${totalEquity.toFixed(2)} (Cash: $${cashBalance.toFixed(2)} + Positions: $${totalPositionValue.toFixed(2)})`);

    // Check if equity target is reached
    if (totalEquity >= EQUITY_TARGET && isPaperMode) {
      console.log(`🎉 EQUITY TARGET REACHED! $${totalEquity.toFixed(2)} >= $${EQUITY_TARGET}`);
      console.log(`💸 Closing all positions and withdrawing $${WITHDRAWAL_AMOUNT}...`);

      // Close ALL positions
      for (const position of positions) {
        const currentPrice = livePrices[position.symbol.toUpperCase()] || position.current_price;
        if (!currentPrice) continue;

        const entryPrice = Number(position.avg_entry_price);
        const quantity = Number(position.quantity);
        const pnl = position.side === 'buy' 
          ? (currentPrice - entryPrice) * quantity
          : (entryPrice - currentPrice) * quantity;

        // Close the trade
        await supabase
          .from('trades')
          .update({
            status: 'closed',
            exit_price: currentPrice,
            pnl: pnl,
            closed_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('symbol', position.symbol)
          .eq('is_paper', true)
          .eq('status', 'open');

        // Delete the position
        await supabase
          .from('positions')
          .delete()
          .eq('id', position.id);
      }

      // Set balance to total equity minus withdrawal (simulating $100k "locked")
      const newBalance = totalEquity - WITHDRAWAL_AMOUNT;
      await supabase
        .from('paper_account')
        .update({ 
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);

      // Log the milestone
      await supabase
        .from('ai_decisions')
        .insert({
          user_id: user.id,
          decision_type: 'equity_target_reached',
          action: 'withdraw',
          reasoning: `🎉 EQUITY TARGET HIT! Total equity: $${totalEquity.toFixed(2)}. Closed all positions and withdrew $${WITHDRAWAL_AMOUNT.toLocaleString()} to lock profits. Remaining trading capital: $${newBalance.toFixed(2)}`,
        });

      // Disable AI trading temporarily
      await supabase
        .from('ai_settings')
        .update({ enabled: false, bot_status: 'idle' })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({
        status: 'equity_target_reached',
        totalEquity: totalEquity.toFixed(2),
        target: EQUITY_TARGET,
        withdrawn: WITHDRAWAL_AMOUNT,
        remainingBalance: newBalance.toFixed(2),
        message: `🎉 Congratulations! Equity target of $${EQUITY_TARGET.toLocaleString()} reached! Withdrew $${WITHDRAWAL_AMOUNT.toLocaleString()} and paused trading.`,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const closedPositions: any[] = [];
    const stoppedPositions: any[] = [];

    for (const position of positions) {
      const currentPrice = livePrices[position.symbol.toUpperCase()] || position.current_price;
      if (!currentPrice) continue;

      const entryPrice = Number(position.avg_entry_price);
      const quantity = Number(position.quantity);
      
      // Calculate P&L percentage based on side
      let pnlPercent = 0;
      let pnl = 0;
      
      if (position.side === 'buy') {
        // Long: profit when price goes up
        pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
        pnl = (currentPrice - entryPrice) * quantity;
      } else {
        // Short: profit when price goes down
        pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
        pnl = (entryPrice - currentPrice) * quantity;
      }

      console.log(`${position.symbol}: Entry $${entryPrice}, Current $${currentPrice}, P&L: ${pnlPercent.toFixed(2)}%`);

      // Check if hit take-profit target OR stop-loss
      const hitTakeProfit = pnlPercent >= TAKE_PROFIT_PERCENT;
      const hitStopLoss = pnlPercent <= STOP_LOSS_PERCENT;

      if (hitTakeProfit || hitStopLoss) {
        const reason = hitTakeProfit 
          ? `🎯 TAKE PROFIT HIT: ${position.symbol} at +${pnlPercent.toFixed(2)}%`
          : `🛑 STOP LOSS HIT: ${position.symbol} at ${pnlPercent.toFixed(2)}%`;
        console.log(reason);

        // Close the position - update the trade
        const { error: tradeUpdateError } = await supabase
          .from('trades')
          .update({
            status: 'closed',
            exit_price: currentPrice,
            pnl: pnl,
            closed_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('symbol', position.symbol)
          .eq('is_paper', isPaperMode)
          .eq('status', 'open');

        if (tradeUpdateError) {
          console.error('Error closing trade:', tradeUpdateError);
          continue;
        }

        // Delete the position
        const { error: posDeleteError } = await supabase
          .from('positions')
          .delete()
          .eq('id', position.id);

        if (posDeleteError) {
          console.error('Error deleting position:', posDeleteError);
          continue;
        }

        // Update paper account balance
        if (isPaperMode) {
          const { data: paperAccount } = await supabase
            .from('paper_account')
            .select('balance')
            .eq('user_id', user.id)
            .single();

          if (paperAccount) {
            // Return original investment +/- P&L
            const originalInvestment = entryPrice * quantity;
            const newBalance = paperAccount.balance + originalInvestment + pnl;
            
            await supabase
              .from('paper_account')
              .update({ 
                balance: newBalance,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', user.id);
          }
        }

        // Log the AI decision
        await supabase
          .from('ai_decisions')
          .insert({
            user_id: user.id,
            decision_type: hitTakeProfit ? 'auto_take_profit' : 'auto_stop_loss',
            symbol: position.symbol,
            action: 'sell',
            reasoning: hitTakeProfit 
              ? `🎯 Auto take-profit triggered at +${pnlPercent.toFixed(2)}% (target: +${TAKE_PROFIT_PERCENT}%). Profit: $${pnl.toFixed(2)}`
              : `🛑 Auto stop-loss triggered at ${pnlPercent.toFixed(2)}% (limit: ${STOP_LOSS_PERCENT}%). Loss: $${pnl.toFixed(2)}`,
          });

        const closedData = {
          symbol: position.symbol,
          entryPrice,
          exitPrice: currentPrice,
          pnlPercent: pnlPercent.toFixed(2),
          pnl: pnl.toFixed(2),
          type: hitTakeProfit ? 'take_profit' : 'stop_loss',
        };

        if (hitTakeProfit) {
          closedPositions.push(closedData);
        } else {
          stoppedPositions.push(closedData);
        }
      } else {
        // Update position with current price and unrealized P&L
        await supabase
          .from('positions')
          .update({
            current_price: currentPrice,
            unrealized_pnl: pnl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', position.id);
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      takeProfitTarget: `+${TAKE_PROFIT_PERCENT}%`,
      stopLossLimit: `${STOP_LOSS_PERCENT}%`,
      checkedPositions: positions.length,
      takeProfitCount: closedPositions.length,
      stopLossCount: stoppedPositions.length,
      closedPositions,
      stoppedPositions,
      isPaperMode,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Auto take-profit error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ULTRA-AGGRESSIVE: 0.03% take-profit for maximum scalping speed
const TAKE_PROFIT_PERCENT = 0.03;
// Tight stop loss to cut losses quick
const STOP_LOSS_PERCENT = -0.15;

// Milestone system - USER REQUESTED: Keep $100, withdraw rest, then compound
const KEEP_FOR_TRADING = 100; // Keep $100 for trading
const WITHDRAWAL_THRESHOLD = 150; // Withdraw when equity reaches $150 (50% profit)

// Symbol mapping for CoinGecko API - Top 100+ cryptos
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'USDT': 'tether',
  'BNB': 'binancecoin',
  'SOL': 'solana',
  'XRP': 'ripple',
  'USDC': 'usd-coin',
  'DOGE': 'dogecoin',
  'ADA': 'cardano',
  'AVAX': 'avalanche-2',
  'TRX': 'tron',
  'TON': 'the-open-network',
  'SHIB': 'shiba-inu',
  'DOT': 'polkadot',
  'LINK': 'chainlink',
  'BCH': 'bitcoin-cash',
  'NEAR': 'near',
  'LEO': 'leo-token',
  'SUI': 'sui',
  'LTC': 'litecoin',
  'APT': 'aptos',
  'UNI': 'uniswap',
  'PEPE': 'pepe',
  'ICP': 'internet-computer',
  'DAI': 'dai',
  'ETC': 'ethereum-classic',
  'RENDER': 'render-token',
  'HBAR': 'hedera-hashgraph',
  'FET': 'fetch-ai',
  'TAO': 'bittensor',
  'ATOM': 'cosmos',
  'CRO': 'crypto-com-chain',
  'IMX': 'immutable-x',
  'FIL': 'filecoin',
  'MATIC': 'matic-network',
  'POL': 'polygon-ecosystem-token',
  'STX': 'blockstack',
  'ARB': 'arbitrum',
  'XLM': 'stellar',
  'KAS': 'kaspa',
  'MNT': 'mantle',
  'OP': 'optimism',
  'OKB': 'okb',
  'VET': 'vechain',
  'AAVE': 'aave',
  'INJ': 'injective-protocol',
  'BONK': 'bonk',
  'WIF': 'dogwifcoin',
  'MKR': 'maker',
  'GRT': 'the-graph',
  'THETA': 'theta-token',
  'RUNE': 'thorchain',
  'FTM': 'fantom',
  'FLOKI': 'floki',
  'SEI': 'sei-network',
  'TIA': 'celestia',
  'PYTH': 'pyth-network',
  'JUP': 'jupiter-exchange-solana',
  'LDO': 'lido-dao',
  'ALGO': 'algorand',
  'ONDO': 'ondo-finance',
  'GALA': 'gala',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'AXS': 'axie-infinity',
  'FLOW': 'flow',
  'XTZ': 'tezos',
  'EOS': 'eos',
  'NEO': 'neo',
  'EGLD': 'elrond-erd-2',
  'KAVA': 'kava',
  'XEC': 'ecash',
  'CFX': 'conflux-token',
  'IOTA': 'iota',
  'CAKE': 'pancakeswap-token',
  'DYDX': 'dydx',
  'SNX': 'havven',
  'RPL': 'rocket-pool',
  'BLUR': 'blur',
  'CRV': 'curve-dao-token',
  'COMP': 'compound-governance-token',
  'ENS': 'ethereum-name-service',
  'GMX': 'gmx',
  'MINA': 'mina-protocol',
  'APE': 'apecoin',
  'CHZ': 'chiliz',
  '1INCH': '1inch',
  'ZIL': 'zilliqa',
  'ENJ': 'enjincoin',
  'BAT': 'basic-attention-token',
  'LRC': 'loopring',
  'QTUM': 'qtum',
  'ICX': 'icon',
  'ZRX': '0x',
  'ANKR': 'ankr',
  'CELO': 'celo',
  'SKL': 'skale',
  'STORJ': 'storj',
  'ONE': 'harmony',
  'OCEAN': 'ocean-protocol',
  'WLD': 'worldcoin-wld',
};

// Generate CDP JWT for Coinbase API
async function generateCdpJwt(apiKey: string, privateKeyPem: string, uri: string): Promise<string> {
  const keyId = apiKey;
  let keyData = privateKeyPem.replace(/\\n/g, '\n').trim();
  
  if (!keyData.includes('-----BEGIN')) {
    keyData = `-----BEGIN EC PRIVATE KEY-----\n${keyData}\n-----END EC PRIVATE KEY-----`;
  }
  
  const algorithm = 'ES256';
  const nonce = crypto.randomUUID();
  
  try {
    const privateKey = await jose.importPKCS8(keyData, algorithm);
    const jwt = await new jose.SignJWT({ nonce, uri })
      .setProtectedHeader({ alg: algorithm, kid: keyId, typ: 'JWT', nonce })
      .setIssuedAt()
      .setExpirationTime('2m')
      .setSubject(keyId)
      .sign(privateKey);
    return jwt;
  } catch {
    // Try EC format
    const ecKeyData = keyData.replace('EC PRIVATE KEY', 'PRIVATE KEY');
    const privateKey = await jose.importPKCS8(ecKeyData, algorithm);
    const jwt = await new jose.SignJWT({ nonce, uri })
      .setProtectedHeader({ alg: algorithm, kid: keyId, typ: 'JWT', nonce })
      .setIssuedAt()
      .setExpirationTime('2m')
      .setSubject(keyId)
      .sign(privateKey);
    return jwt;
  }
}

// Execute REAL sell on Coinbase - converts crypto back to USDC
async function executeCoinbaseSell(symbol: string, quantity: number): Promise<{ success: boolean; usdValue?: number; error?: string }> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    console.log('⚠️ Coinbase API keys not configured, skipping real sell');
    return { success: false, error: 'API keys not configured' };
  }
  
  try {
    const productId = `${symbol}-USDC`;
    const uri = `POST api.coinbase.com/api/v3/brokerage/orders`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    
    const orderId = crypto.randomUUID();
    const orderBody = {
      client_order_id: orderId,
      product_id: productId,
      side: 'SELL',
      order_configuration: {
        market_market_ioc: {
          base_size: quantity.toFixed(8)
        }
      }
    };
    
    console.log(`📤 Selling ${quantity} ${symbol} on Coinbase...`);
    
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      const filledValue = parseFloat(result.order?.filled_value || '0');
      console.log(`✅ SOLD ${quantity} ${symbol} for $${filledValue.toFixed(2)} USDC`);
      return { success: true, usdValue: filledValue };
    } else {
      console.error(`❌ Coinbase sell failed:`, result);
      return { success: false, error: result.error || 'Order failed' };
    }
  } catch (error) {
    console.error(`❌ Coinbase sell error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

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

async function processUserPositions(supabase: any, userId: string, isPaperMode: boolean) {
  console.log(`Processing user: ${userId}, paper mode: ${isPaperMode}`);
  
  // Fetch all open positions for this user
  const { data: positions, error: posError } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_paper', isPaperMode);

  if (posError || !positions || positions.length === 0) {
    return { takeProfitCount: 0, stopLossCount: 0 };
  }

  // Fetch live prices for all position symbols
  const symbols: string[] = [...new Set(positions.map((p: any) => p.symbol))] as string[];
  const livePrices = await fetchLivePrices(symbols);

  // Get account balance
  let cashBalance = 0;
  if (isPaperMode) {
    const { data: paperAccount } = await supabase
      .from('paper_account')
      .select('balance')
      .eq('user_id', userId)
      .single();
    cashBalance = paperAccount?.balance || 0;
  } else {
    const { data: liveAccount } = await supabase
      .from('live_account')
      .select('balance')
      .eq('user_id', userId)
      .single();
    cashBalance = liveAccount?.balance || 0;
  }

  // Calculate total equity
  let totalPositionValue = 0;
  for (const position of positions) {
    const currentPrice = livePrices[position.symbol.toUpperCase()] || position.current_price;
    if (currentPrice) {
      totalPositionValue += currentPrice * Number(position.quantity);
    }
  }
  const totalEquity = cashBalance + totalPositionValue;

  // Simple milestone: Withdraw profits above $100
  const currentTarget = WITHDRAWAL_THRESHOLD;
  const keepAmount = KEEP_FOR_TRADING;

  // Handle milestone reached - withdraw profits when equity > threshold
  if (totalEquity >= currentTarget) {
    const withdrawalAmount = totalEquity - keepAmount;
    console.log(`🎉 MILESTONE for user ${userId}! Equity: $${totalEquity.toFixed(2)}, withdrawing $${withdrawalAmount.toFixed(2)}`);
    
    // Close all positions - EXECUTE REAL SELLS ON COINBASE
    for (const position of positions) {
      const currentPrice = livePrices[position.symbol.toUpperCase()] || position.current_price;
      if (!currentPrice) continue;

      const entryPrice = Number(position.avg_entry_price);
      const quantity = Number(position.quantity);
      let pnl = position.side === 'buy' 
        ? (currentPrice - entryPrice) * quantity
        : (entryPrice - currentPrice) * quantity;
      
      let actualExitPrice = currentPrice;
      
      // Execute REAL sell on Coinbase if in live mode
      if (!isPaperMode) {
        console.log(`💰 Executing REAL Coinbase sell: ${quantity} ${position.symbol}`);
        const sellResult = await executeCoinbaseSell(position.symbol, quantity);
        
        if (sellResult.success && sellResult.usdValue) {
          // Use actual USD received from Coinbase
          actualExitPrice = sellResult.usdValue / quantity;
          pnl = sellResult.usdValue - (entryPrice * quantity);
          console.log(`✅ Real sell completed: ${position.symbol} -> $${sellResult.usdValue.toFixed(2)} USDC`);
        } else {
          console.error(`❌ Real sell failed for ${position.symbol}: ${sellResult.error}`);
        }
      }

      await supabase.from('trades').update({
        status: 'closed',
        exit_price: actualExitPrice,
        pnl,
        closed_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('symbol', position.symbol).eq('is_paper', isPaperMode).eq('status', 'open');

      await supabase.from('positions').delete().eq('id', position.id);
    }

    // Update balance
    if (isPaperMode) {
      await supabase.from('paper_account').update({ balance: keepAmount, updated_at: new Date().toISOString() }).eq('user_id', userId);
    } else {
      await supabase.from('live_account').update({ balance: keepAmount, updated_at: new Date().toISOString() }).eq('user_id', userId);
    }

    await supabase.from('ai_decisions').insert({
      user_id: userId,
      decision_type: 'milestone_reached',
      action: 'withdraw',
      reasoning: `Milestone! Equity: $${totalEquity.toFixed(2)}, withdrew $${withdrawalAmount.toFixed(2)}`,
    });

    return { takeProfitCount: positions.length, stopLossCount: 0, milestone: true };
  }

  // Process individual take-profit/stop-loss
  let takeProfitCount = 0;
  let stopLossCount = 0;

  for (const position of positions) {
    const currentPrice = livePrices[position.symbol.toUpperCase()] || position.current_price;
    if (!currentPrice) continue;

    const entryPrice = Number(position.avg_entry_price);
    const quantity = Number(position.quantity);
    
    let pnlPercent = 0;
    let pnl = 0;
    
    if (position.side === 'buy') {
      pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      pnl = (currentPrice - entryPrice) * quantity;
    } else {
      pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
      pnl = (entryPrice - currentPrice) * quantity;
    }

    const hitTakeProfit = pnlPercent >= TAKE_PROFIT_PERCENT;
    const hitStopLoss = pnlPercent <= STOP_LOSS_PERCENT;

    if (hitTakeProfit || hitStopLoss) {
      console.log(`${hitTakeProfit ? '🎯' : '🛑'} ${position.symbol}: ${pnlPercent.toFixed(3)}%`);
      
      let actualExitPrice = currentPrice;
      let actualPnl = pnl;
      
      // Execute REAL sell on Coinbase if in live mode
      if (!isPaperMode) {
        console.log(`💰 Executing REAL Coinbase sell: ${quantity} ${position.symbol}`);
        const sellResult = await executeCoinbaseSell(position.symbol, quantity);
        
        if (sellResult.success && sellResult.usdValue) {
          actualExitPrice = sellResult.usdValue / quantity;
          actualPnl = sellResult.usdValue - (entryPrice * quantity);
          console.log(`✅ Real sell completed: ${position.symbol} -> $${sellResult.usdValue.toFixed(2)} USDC`);
        } else {
          console.error(`❌ Real sell failed for ${position.symbol}: ${sellResult.error}`);
        }
      }

      await supabase.from('trades').update({
        status: 'closed',
        exit_price: actualExitPrice,
        pnl: actualPnl,
        closed_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('symbol', position.symbol).eq('is_paper', isPaperMode).eq('status', 'open');

      await supabase.from('positions').delete().eq('id', position.id);

      if (isPaperMode) {
        const { data: paperAccount } = await supabase.from('paper_account').select('balance').eq('user_id', userId).single();
        if (paperAccount) {
          const originalInvestment = entryPrice * quantity;
          await supabase.from('paper_account').update({ 
            balance: paperAccount.balance + originalInvestment + actualPnl,
            updated_at: new Date().toISOString()
          }).eq('user_id', userId);
        }
      }

      await supabase.from('ai_decisions').insert({
        user_id: userId,
        decision_type: hitTakeProfit ? 'auto_take_profit' : 'auto_stop_loss',
        symbol: position.symbol,
        action: 'sell',
        reasoning: `${hitTakeProfit ? '🎯 Take profit' : '🛑 Stop loss'} at ${pnlPercent.toFixed(3)}%`,
      });

      if (hitTakeProfit) takeProfitCount++;
      else stopLossCount++;
    } else {
      // Update position with current price
      await supabase.from('positions').update({
        current_price: currentPrice,
        unrealized_pnl: pnl,
        updated_at: new Date().toISOString(),
      }).eq('id', position.id);
    }
  }

  return { takeProfitCount, stopLossCount };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a cron call (no auth) or user call (with auth)
    const authHeader = req.headers.get('Authorization');
    let userIds: string[] = [];

    if (authHeader && !authHeader.includes(Deno.env.get('SUPABASE_ANON_KEY') || '')) {
      // User-specific call - decode JWT
      const token = authHeader.replace('Bearer ', '');
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
          while (payload.length % 4) payload += '=';
          const decoded = JSON.parse(atob(payload));
          if (decoded.sub && decoded.exp > Date.now() / 1000) {
            userIds = [decoded.sub];
          }
        }
      } catch (e) {
        console.log('JWT decode failed, processing all users');
      }
    }

    // If no specific user, process ALL users with AI enabled
    if (userIds.length === 0) {
      console.log('🔄 Cron job: Processing all users with AI enabled');
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('user_id, trading_mode')
        .eq('enabled', true);

      if (aiSettings) {
        userIds = aiSettings.map((s: any) => s.user_id);
      }
    }

    console.log(`Processing ${userIds.length} user(s)`);

    let totalTakeProfit = 0;
    let totalStopLoss = 0;

    for (const userId of userIds) {
      // Get user's trading mode
      const { data: settings } = await supabase
        .from('ai_settings')
        .select('trading_mode')
        .eq('user_id', userId)
        .single();

      const isPaperMode = settings?.trading_mode === 'paper';
      const result = await processUserPositions(supabase, userId, isPaperMode);
      totalTakeProfit += result.takeProfitCount;
      totalStopLoss += result.stopLossCount;
    }

    return new Response(JSON.stringify({
      status: 'success',
      usersProcessed: userIds.length,
      takeProfitTarget: `+${TAKE_PROFIT_PERCENT}%`,
      stopLossLimit: `${STOP_LOSS_PERCENT}%`,
      totalTakeProfitClosed: totalTakeProfit,
      totalStopLossClosed: totalStopLoss,
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

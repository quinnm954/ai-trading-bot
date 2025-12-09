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

// Generate CDP JWT for Coinbase API - robust key parsing
async function generateCdpJwt(apiKey: string, privateKeyPem: string, uri: string): Promise<string> {
  // Clean and normalize the key
  let cleanKey = privateKeyPem.trim()
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  // If key doesn't have PEM headers, try to add them
  if (!cleanKey.includes("-----BEGIN")) {
    if (/^[A-Za-z0-9+/=\s]+$/.test(cleanKey.replace(/\s/g, ''))) {
      cleanKey = `-----BEGIN EC PRIVATE KEY-----\n${cleanKey}\n-----END EC PRIVATE KEY-----`;
    }
  }
  
  let privateKey: jose.KeyLike;
  
  // Try multiple import methods
  const importMethods = [
    // Method 1: Direct PKCS8 import
    async () => {
      return await jose.importPKCS8(cleanKey, "ES256");
    },
    // Method 2: Try with reformatted PKCS8 header
    async () => {
      const pemContent = cleanKey
        .replace(/-----BEGIN.*-----/g, "")
        .replace(/-----END.*-----/g, "")
        .replace(/\s+/g, "");
      const reformatted = `-----BEGIN PRIVATE KEY-----\n${pemContent}\n-----END PRIVATE KEY-----`;
      return await jose.importPKCS8(reformatted, "ES256");
    },
    // Method 3: Parse SEC1 EC key manually
    async () => {
      const pemContents = cleanKey
        .replace(/-----BEGIN.*-----/g, "")
        .replace(/-----END.*-----/g, "")
        .replace(/\s+/g, "");
      
      const binaryString = atob(pemContents);
      const keyBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        keyBytes[i] = binaryString.charCodeAt(i);
      }
      
      let dBytes: Uint8Array | null = null;
      
      for (let i = 0; i < keyBytes.length - 32; i++) {
        if (keyBytes[i] === 0x04 && keyBytes[i + 1] === 0x20) {
          dBytes = keyBytes.slice(i + 2, i + 34);
          break;
        }
      }
      
      if (!dBytes) {
        for (let i = 7; i < keyBytes.length - 32; i++) {
          if (keyBytes[i - 1] === 0x20 || keyBytes[i - 1] === 0x21) {
            const candidate = keyBytes.slice(i, i + 32);
            const unique = new Set(candidate);
            if (unique.size > 5) {
              dBytes = candidate;
              break;
            }
          }
        }
      }
      
      if (!dBytes) throw new Error("Could not extract private key bytes");
      
      const base64url = (bytes: Uint8Array) => 
        btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
      
      const jwk: jose.JWK = {
        kty: "EC",
        crv: "P-256",
        d: base64url(dBytes),
        x: base64url(new Uint8Array(32)),
        y: base64url(new Uint8Array(32)),
      };
      
      for (let i = 0; i < keyBytes.length - 65; i++) {
        if (keyBytes[i] === 0x04 && i + 65 <= keyBytes.length) {
          const nextBytes = keyBytes.slice(i, i + 65);
          if (nextBytes[0] === 0x04) {
            jwk.x = base64url(nextBytes.slice(1, 33));
            jwk.y = base64url(nextBytes.slice(33, 65));
            break;
          }
        }
      }
      
      return await jose.importJWK(jwk, "ES256") as jose.KeyLike;
    },
  ];
  
  for (const method of importMethods) {
    try {
      privateKey = await method();
      
      return await new jose.SignJWT({ iss: "cdp", sub: apiKey, uri })
        .setProtectedHeader({ alg: "ES256", kid: apiKey, nonce: crypto.randomUUID(), typ: "JWT" })
        .setIssuedAt()
        .setNotBefore(Math.floor(Date.now() / 1000))
        .setExpirationTime("2m")
        .sign(privateKey);
    } catch {
      continue;
    }
  }
  
  throw new Error("All key import methods failed");
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

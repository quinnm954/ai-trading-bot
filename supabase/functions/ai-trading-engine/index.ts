import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// RISK MANAGER INTEGRATION - Validates trades before execution
// =============================================================================

interface RiskValidationResult {
  approved: boolean;
  reason: string;
  severity: 'info' | 'warning' | 'critical';
  violations: string[];
  adjustedSize?: number;
}

/**
 * Calls the RiskManager edge function to validate a trade proposal.
 * Returns approval status and reasoning. MUST be called before every trade.
 */
async function validateTradeWithRiskManager(
  supabase: any,
  userId: string,
  tradeProposal: {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    positionValue: number;
    stopLoss?: number;
  },
  currentEquity: number,
  openPositionsCount: number,
  openPositionsValue: number
): Promise<RiskValidationResult> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/risk-manager`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'validate_trade',
        userId,
        tradeProposal,
        currentEquity,
        openPositionsCount,
        openPositionsValue,
      }),
    });

    if (!response.ok) {
      console.error(`❌ RiskManager error: ${response.status}`);
      // Fail SAFE - if RiskManager is unavailable, block the trade
      return {
        approved: false,
        reason: 'RiskManager unavailable - blocking trade for safety',
        severity: 'critical',
        violations: ['risk_manager_unavailable'],
      };
    }

    const result = await response.json();
    return result as RiskValidationResult;
  } catch (error) {
    console.error('❌ RiskManager call failed:', error);
    // Fail SAFE - block trade if we can't validate
    return {
      approved: false,
      reason: `RiskManager error: ${error instanceof Error ? error.message : 'Unknown'}`,
      severity: 'critical',
      violations: ['risk_manager_error'],
    };
  }
}

/**
 * Records a loss with the RiskManager for daily/weekly tracking
 */
async function recordLossWithRiskManager(
  userId: string,
  lossAmount: number,
  currentEquity: number
): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    await fetch(`${supabaseUrl}/functions/v1/risk-manager`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'record_loss',
        userId,
        lossAmount,
        currentEquity,
      }),
    });
  } catch (error) {
    console.error('Failed to record loss with RiskManager:', error);
  }
}

/**
 * Updates drawdown tracking with RiskManager
 */
async function updateDrawdownTracking(
  userId: string,
  currentEquity: number
): Promise<{ killSwitchTriggered: boolean }> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/risk-manager`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update_drawdown',
        userId,
        currentEquity,
      }),
    });

    if (!response.ok) {
      return { killSwitchTriggered: false };
    }

    const result = await response.json();
    return { killSwitchTriggered: result.killSwitchTriggered || false };
  } catch (error) {
    console.error('Failed to update drawdown:', error);
    return { killSwitchTriggered: false };
  }
}

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

// Execute REAL buy on Coinbase - uses USDC to buy crypto with LIMIT orders for lower fees
async function executeCoinbaseBuy(symbol: string, usdAmount: number): Promise<{ success: boolean; quantity?: number; price?: number; error?: string }> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    console.log('⚠️ Coinbase API keys not configured, simulating buy');
    return { success: false, error: 'API keys not configured' };
  }
  
  try {
    const productId = `${symbol}-USDC`;
    const uri = `POST api.coinbase.com/api/v3/brokerage/orders`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    
    // Get current price for limit order
    const tickerUri = `GET api.coinbase.com/api/v3/brokerage/products/${productId}/ticker`;
    const tickerJwt = await generateCdpJwt(apiKey, apiSecret, tickerUri);
    const priceResponse = await fetch(`https://api.coinbase.com/api/v3/brokerage/products/${productId}/ticker`, {
      headers: { 'Authorization': `Bearer ${tickerJwt}` },
    });
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.price || '0');
    
    const orderId = crypto.randomUUID();
    let orderBody: any;
    
    if (currentPrice > 0) {
      // Calculate quantity from USD amount
      const quantity = usdAmount / currentPrice;
      
      // Get precision for this symbol
      const precisionMap: Record<string, number> = {
        'BTC': 8, 'ETH': 8, 'SOL': 6, 'XRP': 2, 'DOGE': 2, 'ADA': 2, 'AVAX': 4,
        'DOT': 4, 'LINK': 4, 'UNI': 4, 'LTC': 6, 'ATOM': 4, 'NEAR': 4, 'APT': 4,
        'ARB': 2, 'OP': 4, 'INJ': 4, 'SUI': 4, 'TON': 4, 'ICP': 4, 'FIL': 4,
        'RENDER': 4, 'FET': 2, 'TAO': 6, 'AAVE': 6, 'GRT': 2, 'SHIB': 0, 'PEPE': 0,
      };
      const precision = precisionMap[symbol.toUpperCase()] ?? 4;
      const roundedQty = Math.floor(quantity * Math.pow(10, precision)) / Math.pow(10, precision);
      
      // Use LIMIT order with post_only for MAKER fees (0.4% vs 0.6% taker)
      // Buy at current price to maximize fill chance while getting maker fee
      orderBody = {
        client_order_id: orderId,
        product_id: productId,
        side: 'BUY',
        order_configuration: {
          limit_limit_gtc: {
            base_size: roundedQty.toFixed(precision),
            limit_price: currentPrice.toFixed(8), // Buy at current price
            post_only: true // Ensures maker fee (0.4%)
          }
        }
      };
      console.log(`📤 LIMIT BUY ${roundedQty} ${symbol} @ $${currentPrice.toFixed(4)} (maker fee: 0.4%)...`);
    } else {
      // Fallback to market order if can't get price
      console.log(`⚠️ Could not get price for ${symbol}, using market order (0.6% fee)`);
      orderBody = {
        client_order_id: orderId,
        product_id: productId,
        side: 'BUY',
        order_configuration: {
          market_market_ioc: {
            quote_size: usdAmount.toFixed(2)
          }
        }
      };
    }
    
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    
    const result = await response.json();
    console.log(`📋 Coinbase response for ${symbol}:`, JSON.stringify(result).substring(0, 500));
    
    if (response.ok && result.success) {
      const filledSize = parseFloat(result.order?.filled_size || '0');
      const avgPrice = parseFloat(result.order?.average_filled_price || currentPrice.toString());
      const orderStatus = result.order?.status;
      
      // For limit orders, check if pending (GTC orders don't fill immediately)
      if (orderStatus === 'PENDING' || orderStatus === 'OPEN') {
        // Order placed but not filled yet - this is expected for post_only limit orders
        // Calculate expected quantity from order
        const expectedQty = usdAmount / currentPrice;
        console.log(`⏳ LIMIT ORDER PLACED: ${expectedQty.toFixed(6)} ${symbol} @ $${currentPrice.toFixed(4)} - waiting for fill`);
        return { success: true, quantity: expectedQty, price: currentPrice };
      }
      
      if (filledSize > 0 && avgPrice > 0) {
        console.log(`✅ REAL BUY SUCCESS: Got ${filledSize} ${symbol} @ $${avgPrice.toFixed(4)}`);
        return { success: true, quantity: filledSize, price: avgPrice };
      } else {
        console.error(`⚠️ Order accepted but not filled for ${symbol}. Status: ${orderStatus}`);
        return { success: false, error: `Order not filled. Status: ${orderStatus}` };
      }
    } else {
      const errorMsg = result.error_response?.message || result.error_response?.preview_failure_reason || result.error || JSON.stringify(result);
      console.error(`❌ Coinbase buy failed for ${symbol}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error(`❌ Coinbase buy error for ${symbol}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Get actual USDC balance from Coinbase and auto-convert DAI if needed
async function getAvailableUsdcBalance(): Promise<{ usdcBalance: number; daiConverted: number }> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    return { usdcBalance: 0, daiConverted: 0 };
  }
  
  try {
    const uri = `GET api.coinbase.com/api/v3/brokerage/accounts`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/accounts', {
      headers: { 'Authorization': `Bearer ${jwt}` },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch Coinbase accounts');
      return { usdcBalance: 0, daiConverted: 0 };
    }
    
    const data = await response.json();
    let usdcBalance = 0;
    let daiBalance = 0;
    
    for (const account of data.accounts || []) {
      const balance = parseFloat(account.available_balance?.value || '0');
      if (account.currency === 'USDC' && balance > 0) {
        usdcBalance = balance;
      }
      if (account.currency === 'DAI' && balance > 0) {
        daiBalance = balance;
      }
    }
    
    console.log(`💵 Available: $${usdcBalance.toFixed(2)} USDC, $${daiBalance.toFixed(2)} DAI`);
    
    // Auto-convert DAI to USDC if we have significant DAI and low USDC
    let daiConverted = 0;
    if (daiBalance > 5 && usdcBalance < 10) {
      console.log(`🔄 Auto-converting ${daiBalance.toFixed(2)} DAI to USDC...`);
      
      const convertUri = `POST api.coinbase.com/api/v3/brokerage/orders`;
      const convertJwt = await generateCdpJwt(apiKey, apiSecret, convertUri);
      
      // DAI has 4 decimal precision
      const daiQty = Math.floor(daiBalance * 10000) / 10000;
      
      const orderBody = {
        client_order_id: crypto.randomUUID(),
        product_id: 'DAI-USDC',
        side: 'SELL', // Sell DAI for USDC
        order_configuration: {
          market_market_ioc: {
            base_size: daiQty.toFixed(4)
          }
        }
      };
      
      const convertResponse = await fetch('https://api.coinbase.com/api/v3/brokerage/orders', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${convertJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderBody),
      });
      
      const convertResult = await convertResponse.json();
      
      if (convertResponse.ok && convertResult.success) {
        const filledValue = parseFloat(convertResult.order?.filled_value || '0');
        daiConverted = filledValue;
        usdcBalance += filledValue;
        console.log(`✅ Converted ${daiQty} DAI → $${filledValue.toFixed(2)} USDC`);
      } else {
        console.error('❌ DAI conversion failed:', convertResult.error_response?.message || 'Unknown error');
      }
    }
    
    return { usdcBalance, daiConverted };
  } catch (error) {
    console.error('Error getting USDC balance:', error);
    return { usdcBalance: 0, daiConverted: 0 };
  }
}

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  change7d: number;
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
  // Top 100+ cryptocurrencies by market cap for maximum scalping opportunities
  const cryptos = [
    // Top 50
    'bitcoin', 'ethereum', 'tether', 'xrp', 'bnb', 'solana', 'usdc', 'dogecoin',
    'cardano', 'tron', 'avalanche-2', 'chainlink', 'shiba-inu', 'stellar', 'polkadot',
    'hedera', 'bitcoin-cash', 'uniswap', 'sui', 'litecoin', 'pepe', 'near', 'aptos',
    'internet-computer', 'ethereum-classic', 'render-token', 'cronos', 'kaspa',
    'aave', 'vechain', 'matic-network', 'algorand', 'cosmos', 'fantom', 'filecoin',
    'arbitrum', 'optimism', 'injective-protocol', 'immutable-x', 'theta-token', 'sei-network',
    'celestia', 'bonk', 'floki', 'jupiter-exchange-solana', 'ondo-finance', 'fetch-ai', 'worldcoin-wld',
    'pyth-network', 'bittensor',
    // 51-100 more assets
    'the-open-network', 'leo-token', 'dai', 'maker', 'the-graph', 'thorchain',
    'lido-dao', 'gala', 'the-sandbox', 'decentraland', 'axie-infinity', 'flow',
    'tezos', 'eos', 'neo', 'elrond-erd-2', 'kava', 'ecash', 'conflux-token', 'iota',
    'pancakeswap-token', 'dydx', 'havven', 'rocket-pool', 'blur', 'curve-dao-token',
    'compound-governance-token', 'ethereum-name-service', 'gmx', 'mina-protocol',
    'apecoin', 'chiliz', '1inch', 'zilliqa', 'enjincoin', 'basic-attention-token',
    'loopring', 'qtum', 'icon', '0x', 'ankr', 'celo', 'skale', 'storj', 'harmony',
    'ocean-protocol', 'dogwifcoin', 'mantle', 'okb', 'polygon-ecosystem-token',
    'blockstack', 'crypto-com-chain'
  ];
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // CoinGecko allows up to 250 coins per request
      // Include 7d change for dip-buying strategy
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cryptos.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h,7d&per_page=100`;
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
        change7d: coin.price_change_percentage_7d_in_currency || 0,
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
        change7d: 0, // CoinCap doesn't provide 7d data, default to 0
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
    { symbol: 'BTC', price: 90000, change24h: -1.5, change7d: 5, volume: 40000000000, high24h: 92000, low24h: 89000 },
    { symbol: 'ETH', price: 3100, change24h: -0.5, change7d: 3, volume: 20000000000, high24h: 3200, low24h: 3050 },
    { symbol: 'SOL', price: 130, change24h: -0.8, change7d: 8, volume: 5000000000, high24h: 138, low24h: 128 },
    { symbol: 'XRP', price: 2.05, change24h: -0.7, change7d: 4, volume: 3000000000, high24h: 2.15, low24h: 2.00 },
    { symbol: 'DOGE', price: 0.14, change24h: 0.5, change7d: 2, volume: 1000000000, high24h: 0.145, low24h: 0.138 },
  ];
}

// Multi-timeframe analysis structure
interface TimeframeSignal {
  timeframe: string;
  trend: 'bullish' | 'bearish' | 'neutral';
  strength: number; // -1 to 1
  momentum: number; // Rate of change
}

interface MultiTimeframeAnalysis {
  symbol: string;
  signals: TimeframeSignal[];
  overallBias: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  entryScore: number; // 0-100, higher = better entry
  exitUrgency: number; // 0-100, higher = exit soon
  bestEntry: boolean; // True if all timeframes align for entry
  reasoning: string;
}

// Analyze a coin across multiple "simulated" timeframes using 24h data
function analyzeMultiTimeframe(coin: MarketData): MultiTimeframeAnalysis {
  const priceRange = coin.high24h - coin.low24h;
  const pricePosition = priceRange > 0 ? (coin.price - coin.low24h) / priceRange : 0.5;
  
  // Simulate different timeframe signals based on available data
  // In production, you'd fetch actual OHLC candles for each timeframe
  const signals: TimeframeSignal[] = [];
  
  // 1-HOUR timeframe (short-term momentum)
  const hourlyTrend = coin.change24h > 0.5 ? 'bullish' : coin.change24h < -0.5 ? 'bearish' : 'neutral';
  const hourlyStrength = Math.max(-1, Math.min(1, coin.change24h / 5));
  signals.push({
    timeframe: '1h',
    trend: hourlyTrend,
    strength: hourlyStrength,
    momentum: coin.change24h / 24, // Approx hourly rate
  });
  
  // 4-HOUR timeframe (swing direction)
  const fourHourPosition = pricePosition > 0.6 ? 'bullish' : pricePosition < 0.4 ? 'bearish' : 'neutral';
  const fourHourStrength = (pricePosition - 0.5) * 2;
  signals.push({
    timeframe: '4h',
    trend: fourHourPosition,
    strength: fourHourStrength,
    momentum: (pricePosition - 0.5) * coin.change24h / 6,
  });
  
  // DAILY timeframe (overall trend)
  const dailyTrend = coin.change24h > 2 ? 'bullish' : coin.change24h < -2 ? 'bearish' : 'neutral';
  const dailyStrength = Math.max(-1, Math.min(1, coin.change24h / 10));
  signals.push({
    timeframe: '1d',
    trend: dailyTrend,
    strength: dailyStrength,
    momentum: coin.change24h,
  });
  
  // Calculate alignment score (how many timeframes agree)
  const bullishCount = signals.filter(s => s.trend === 'bullish').length;
  const bearishCount = signals.filter(s => s.trend === 'bearish').length;
  const avgStrength = signals.reduce((sum, s) => sum + s.strength, 0) / signals.length;
  
  // Determine overall bias
  let overallBias: MultiTimeframeAnalysis['overallBias'];
  let entryScore = 50;
  let exitUrgency = 0;
  
  if (bullishCount === 3 && avgStrength > 0.3) {
    overallBias = 'strong_buy';
    entryScore = 85 + (avgStrength * 15);
  } else if (bullishCount >= 2 && avgStrength > 0) {
    overallBias = 'buy';
    entryScore = 65 + (avgStrength * 20);
  } else if (bearishCount === 3 && avgStrength < -0.3) {
    overallBias = 'strong_sell';
    entryScore = 10;
    exitUrgency = 90;
  } else if (bearishCount >= 2 && avgStrength < 0) {
    overallBias = 'sell';
    entryScore = 25;
    exitUrgency = 70;
  } else {
    overallBias = 'neutral';
    entryScore = 45 + (avgStrength * 10);
    exitUrgency = 30;
  }
  
  // BEST ENTRY: All timeframes bullish AND price near low of range (oversold bounce)
  const bestEntry = bullishCount >= 2 && pricePosition < 0.4 && coin.change24h > -2;
  if (bestEntry) entryScore = Math.min(100, entryScore + 15);
  
  // Increase exit urgency if price at top of range with bearish signals
  if (pricePosition > 0.8 && bearishCount >= 1) {
    exitUrgency = Math.min(100, exitUrgency + 30);
  }
  
  const tfSummary = signals.map(s => `${s.timeframe}:${s.trend}`).join(', ');
  const reasoning = `MTF: ${tfSummary} | Entry: ${entryScore.toFixed(0)}/100 | Exit urgency: ${exitUrgency.toFixed(0)}/100`;
  
  return {
    symbol: coin.symbol,
    signals,
    overallBias,
    entryScore: Math.round(entryScore),
    exitUrgency: Math.round(exitUrgency),
    bestEntry,
    reasoning,
  };
}

// Analyze trend for each coin using multiple signals + multi-timeframe
function analyzeTrend(coin: MarketData): TrendAnalysis {
  const mtf = analyzeMultiTimeframe(coin);
  const priceRange = coin.high24h - coin.low24h;
  const pricePosition = priceRange > 0 ? (coin.price - coin.low24h) / priceRange : 0.5;
  
  // Calculate trend strength based on multiple factors + MTF
  let trendScore = 0;
  
  // Factor 1: 24h price change (weight: 30%)
  const changeScore = Math.max(-1, Math.min(1, coin.change24h / 10));
  trendScore += changeScore * 0.3;
  
  // Factor 2: Price position in daily range (weight: 20%)
  const positionScore = (pricePosition - 0.5) * 2;
  trendScore += positionScore * 0.2;
  
  // Factor 3: Momentum alignment (weight: 20%)
  const momentumAlignment = coin.change24h > 0 && pricePosition > 0.5 ? 1 :
                            coin.change24h < 0 && pricePosition < 0.5 ? -1 : 0;
  trendScore += momentumAlignment * 0.2;
  
  // Factor 4: Multi-timeframe bias (weight: 30%) - NEW
  const mtfScore = mtf.overallBias === 'strong_buy' ? 1 :
                   mtf.overallBias === 'buy' ? 0.5 :
                   mtf.overallBias === 'strong_sell' ? -1 :
                   mtf.overallBias === 'sell' ? -0.5 : 0;
  trendScore += mtfScore * 0.3;
  
  // Determine trend classification
  let trend: TrendAnalysis['trend'];
  let shouldTrade = true;
  let reason = '';
  
  // UPTREND ONLY MODE: Trade strong uptrends and regular uptrends, skip neutral/downtrends
  if (trendScore >= 0.5) {
    trend = 'strong_uptrend';
    shouldTrade = true;
    reason = `🚀 Strong uptrend: +${coin.change24h.toFixed(1)}% | ${mtf.reasoning}`;
  } else if (trendScore >= 0.1) {
    trend = 'uptrend';
    shouldTrade = true; // Trade uptrends too
    reason = `📈 Uptrend: +${coin.change24h.toFixed(1)}% | ${mtf.reasoning}`;
  } else if (trendScore <= -0.7) {
    trend = 'strong_downtrend';
    shouldTrade = false;
    // Analyze for potential reversal entry timing
    const reversalPotential = mtf.entryScore > 60 ? 'HIGH' : mtf.entryScore > 40 ? 'MEDIUM' : 'LOW';
    const watchSignal = pricePosition < 0.2 ? '👀 Near support - watching for bounce' : '⏳ Waiting for capitulation';
    reason = `⚠️ Strong downtrend: ${coin.change24h.toFixed(1)}% - WATCHING | Reversal potential: ${reversalPotential} | ${watchSignal}`;
  } else if (trendScore <= -0.3) {
    trend = 'downtrend';
    shouldTrade = false;
    reason = `📉 Downtrend: ${coin.change24h.toFixed(1)}% - AVOIDING`;
  } else {
    trend = 'neutral';
    shouldTrade = false; // Skip neutral markets
    reason = `➡️ Neutral (skipping): ${coin.change24h.toFixed(1)}% | ${mtf.reasoning}`;
  }
  
  return {
    symbol: coin.symbol,
    trend,
    trendStrength: trendScore,
    shouldTrade,
    reason,
  };
}

// DIP-BUYING STRATEGY: Buy pullbacks in uptrending assets (not peaks)
function filterByTrend(marketData: MarketData[]): { tradeable: MarketData[], trendAnalysis: TrendAnalysis[] } {
  // Step 1: Find DIP-BUY candidates - assets that:
  // - Have positive 7-day trend (overall uptrend)
  // - But have pulled back in 24h (negative or low 24h change = buying the dip)
  const dipBuyCandidates = marketData.filter(coin => {
    const has7dUptrend = coin.change7d > 2; // Asset is up >2% over 7 days (uptrend)
    const hasDip = coin.change24h < 1 && coin.change24h > -8; // Recent pullback (-8% to +1%)
    const notCrashing = coin.change24h > -8; // Avoid free-falling assets
    return has7dUptrend && hasDip && notCrashing;
  });
  
  // Also include strong momentum plays (positive 24h AND 7d)
  const momentumPlays = marketData.filter(coin => {
    const strongMomentum = coin.change24h > 3 && coin.change7d > 5;
    const notOverbought = coin.change24h < 15; // Avoid parabolic moves
    return strongMomentum && notOverbought;
  });
  
  // Combine and dedupe
  const combinedCandidates = [...dipBuyCandidates];
  momentumPlays.forEach(coin => {
    if (!combinedCandidates.find(c => c.symbol === coin.symbol)) {
      combinedCandidates.push(coin);
    }
  });
  
  console.log(`🎯 DIP-BUY FILTER: ${dipBuyCandidates.length} dips + ${momentumPlays.length} momentum = ${combinedCandidates.length} candidates`);
  
  // Step 2: Analyze trends for candidates
  const trendAnalysis = combinedCandidates.map(coin => {
    const analysis = analyzeTrend(coin);
    // For dip-buying, we want to trade even on slight pullbacks in uptrending assets
    const isDipBuy = coin.change7d > 2 && coin.change24h < 1;
    if (isDipBuy && coin.change24h > -5) {
      // Override to allow trading dips in uptrending assets
      return {
        ...analysis,
        shouldTrade: true,
        reason: `🔄 DIP-BUY: 7d: +${coin.change7d.toFixed(1)}% uptrend, 24h: ${coin.change24h.toFixed(1)}% pullback | Entry opportunity`,
      };
    }
    return analysis;
  });
  
  const tradeable = combinedCandidates.filter(coin => {
    const analysis = trendAnalysis.find(t => t.symbol === coin.symbol);
    return analysis?.shouldTrade ?? false;
  });
  
  console.log(`📈 Tradeable (dips + momentum): ${tradeable.length}`);
  
  return { tradeable, trendAnalysis };
}

// Strategy-specific trading logic descriptions - OPTIMIZED FOR FAST SCALPING
const strategyDescriptions: Record<string, string> = {
  rsi: 'RSI SCALP: Aggressive oversold bounces. Buy RSI < 35, target 0.5% gain in minutes. Fast in/out.',
  ema_crossover: 'EMA SCALP: Ride momentum waves. Buy on ANY upward cross, exit at 0.5%+ gain. Speed is key.',
  macd: 'MACD SCALP: Trade histogram momentum spikes. Enter on rising histogram, exit fast at 0.5%.',
  trend_breakout: 'BREAKOUT SCALP: Chase breakouts aggressively. Enter on ANY breakout, quick 0.5% target.',
  volatility_breakout: 'VOLATILITY SCALP: Exploit high volatility for quick gains. Enter low, exit on any spike.',
  grid: 'GRID SCALP: Rapid range trading. Buy low, sell high within tight ranges for quick profits.',
  dca: 'DCA SCALP: Accumulate on dips, sell on ANY bounce for quick 0.5%+ gains.',
  custom: 'ADAPTIVE SCALP: Use momentum, volume, and price action for fastest possible profits.',
};

// AUTONOMOUS AI CONFIG - Full control to reach $1M target
const AUTONOMOUS_CONFIG = {
  MIN_CONFIDENCE: 0.50,      // AI decides confidence threshold
  TARGET_PROFIT: 1.0,        // 1% target per trade with leverage
  MAX_HOLD_MINUTES: 60,      // AI can hold longer with leverage
  AGGRESSIVE_MULTIPLIER: 2.0, // Boost for high-confidence trades
  TOP_TRADES_PER_CYCLE: 15,  // More trades per cycle
  TARGET_EQUITY: 1000000,    // $1M goal
};

// Calculate optimal leverage based on balance and target
function calculateOptimalLeverage(balance: number, targetEquity: number, maxLeverage: number, riskTolerance: string): number {
  const distanceToTarget = targetEquity / balance;
  
  // More aggressive leverage when further from target
  let optimalLeverage = 1;
  
  if (riskTolerance === 'aggressive') {
    if (distanceToTarget > 1000) optimalLeverage = maxLeverage; // Very far, max leverage
    else if (distanceToTarget > 100) optimalLeverage = Math.min(maxLeverage, 10);
    else if (distanceToTarget > 10) optimalLeverage = Math.min(maxLeverage, 5);
    else optimalLeverage = Math.min(maxLeverage, 3);
  } else if (riskTolerance === 'moderate') {
    optimalLeverage = Math.min(maxLeverage, Math.max(1, Math.floor(distanceToTarget / 100)));
  } else {
    optimalLeverage = 1; // Conservative = no leverage
  }
  
  return Math.min(optimalLeverage, maxLeverage);
}

// AI decides optimal position size based on market conditions and distance to goal
function calculateOptimalPositionSize(
  balance: number, 
  targetEquity: number, 
  confidence: number, 
  leverage: number,
  trendStrength: number
): number {
  const distanceToTarget = targetEquity / balance;
  
  // Base position size scales with confidence and trend strength
  let baseSize = 10 + (confidence * 30) + (Math.max(0, trendStrength) * 20);
  
  // Scale up when far from target
  if (distanceToTarget > 1000) baseSize *= 2;
  else if (distanceToTarget > 100) baseSize *= 1.5;
  
  // Apply leverage multiplier (notional exposure)
  const leveragedSize = baseSize * leverage;
  
  // Cap at 80% of balance per position
  return Math.min(80, leveragedSize);
}

// AI-powered market analysis with FULL AUTONOMY - using Lovable AI
async function analyzeWithAI(
  marketData: MarketData[], 
  balance: number, 
  maxPositionSize: number, 
  trendAnalysis: TrendAnalysis[], 
  bestStrategy: string, 
  regime: string,
  leverage: number = 1,
  targetEquity: number = 1000000
): Promise<AITradingDecision[]> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.log('No Lovable API key, falling back to rule-based analysis');
    return [];
  }

  // Build trend context for AI
  const trendContext = trendAnalysis.map(t => `${t.symbol}: ${t.trend} (${t.reason})`).join('\n');
  
  // Get strategy description
  const strategyDesc = strategyDescriptions[bestStrategy] || strategyDescriptions.custom;
  
  const distanceToTarget = targetEquity / balance;

  const prompt = `You are an AUTONOMOUS AI trading system with FULL CONTROL to reach $1,000,000.

MISSION: Grow balance from $${balance.toFixed(2)} to $${targetEquity.toFixed(0)} ($1M target)
DISTANCE TO TARGET: ${distanceToTarget.toFixed(0)}x growth needed

YOU HAVE FULL CONTROL OVER:
- Position sizing (up to ${maxPositionSize}% per trade)
- Leverage (up to ${leverage}x available)
- Entry timing and exit targets
- Risk management and strategy selection

CURRENT STRATEGY: ${bestStrategy.toUpperCase()}
${strategyDesc}

MARKET REGIME: ${regime.toUpperCase()}
LEVERAGE AVAILABLE: ${leverage}x (use notional exposure = position * leverage)

TREND ANALYSIS:
${trendContext}

LIVE MARKET DATA:
${marketData.filter(m => m.price != null).map(m => `${m.symbol}: $${(m.price || 0).toFixed(2)} | 24h: ${(m.change24h || 0) > 0 ? '+' : ''}${(m.change24h || 0).toFixed(2)}% | Range: $${(m.low24h || 0).toFixed(2)}-$${(m.high24h || 0).toFixed(2)} | Vol: $${((m.volume || 0)/1e9).toFixed(1)}B`).join('\n')}

AUTONOMOUS DECISION RULES:
1. You decide optimal position size based on confidence and trend strength
2. Use leverage to amplify returns on high-conviction trades
3. Only trade UPTRENDS - skip neutral and downtrends
4. Maximize expected value: higher confidence = larger position
5. Target ${leverage > 1 ? '1-3%' : '0.5-1%'} profit per trade with ${leverage}x leverage

CALCULATE:
- Effective position = size_percent * ${leverage} (leverage multiplier)
- Take profit = 0.5% * ${leverage} (amplified by leverage)
- Stop loss = 0.1% (tight stops to protect capital)

Return ONLY JSON array with your TOP ${Math.min(15, Math.ceil(balance / 5))} autonomous decisions:
[{"symbol":"BTC","action":"buy","confidence":0.95,"reason":"Strong uptrend, momentum surge, ${leverage}x leverage","pattern":"leveraged_momentum","size_percent":${Math.min(50, maxPositionSize)},"leverage":${leverage}}]

Rules:
- confidence: 0.50 to 0.99
- action: "buy" only (we scalp longs)
- size_percent: 10-${maxPositionSize} (aggressive sizing for $1M goal)
- leverage: 1-${leverage} (your choice based on conviction)
- If no uptrends available, return []`;

  try {
    console.log(`🤖 AI Autonomous Mode: ${leverage}x leverage, targeting $${targetEquity}`);
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are an autonomous AI trading system with full control over position sizing and leverage. Your goal is to maximize growth toward the $1M target. Respond ONLY with valid JSON arrays.' },
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

// SPEED SCALPING: Strategy-specific rule-based analysis optimized for fastest profits
function analyzeWithRules(
  marketData: MarketData[],
  regime: string,
  maxPositionSize: number,
  balance: number,
  bestStrategy: string
): AITradingDecision[] {
  const decisions: AITradingDecision[] = [];
  
  console.log(`⚡ SPEED SCALP: Using ${bestStrategy} for ${regime} market`);
  
  for (const coin of marketData) {
    let action: 'buy' | 'sell' | 'hold' = 'hold';
    let confidence = 0;
    let reason = '';
    let pattern = '';
    
    const priceRange = coin.high24h - coin.low24h;
    const pricePosition = priceRange > 0 ? (coin.price - coin.low24h) / priceRange : 0.5;
    const volatilityPercent = priceRange / coin.price * 100;
    
    // AGGRESSIVE SCALPING LOGIC - Multiple entry signals per strategy
    switch (bestStrategy) {
      case 'rsi':
        // AGGRESSIVE RSI - Multiple entry points
        if (pricePosition < 0.25) {
          action = 'buy';
          confidence = 0.95;
          reason = `🔥 RSI SCALP: Deep oversold (${(pricePosition * 100).toFixed(0)}%) - BOUNCE IMMINENT`;
          pattern = 'rsi_deep_oversold';
        } else if (pricePosition < 0.4 && coin.change24h < -0.5) {
          action = 'buy';
          confidence = 0.85;
          reason = `📉 RSI SCALP: Oversold dip (${(pricePosition * 100).toFixed(0)}%)`;
          pattern = 'rsi_oversold';
        } else if (pricePosition < 0.5 && coin.change24h >= 0) {
          action = 'buy';
          confidence = 0.75;
          reason = `📊 RSI SCALP: Mid-range reversal starting`;
          pattern = 'rsi_reversal';
        }
        break;
        
      case 'ema_crossover':
      case 'macd':
        // AGGRESSIVE MOMENTUM - Any positive signal
        if (coin.change24h > 1.5) {
          action = 'buy';
          confidence = 0.95;
          reason = `🚀 MOMENTUM SCALP: Strong surge +${coin.change24h.toFixed(2)}%`;
          pattern = 'momentum_surge';
        } else if (coin.change24h > 0.5 && pricePosition > 0.5) {
          action = 'buy';
          confidence = 0.88;
          reason = `📈 MOMENTUM SCALP: Uptrend +${coin.change24h.toFixed(2)}%`;
          pattern = 'momentum_trend';
        } else if (coin.change24h > 0.1) {
          action = 'buy';
          confidence = 0.75;
          reason = `⬆️ MOMENTUM SCALP: Early move +${coin.change24h.toFixed(2)}%`;
          pattern = 'momentum_early';
        }
        break;
        
      case 'trend_breakout':
        // AGGRESSIVE BREAKOUT - Chase any breakout
        if (pricePosition > 0.85 && coin.change24h > 0.5) {
          action = 'buy';
          confidence = 0.92;
          reason = `💥 BREAKOUT SCALP: Breaking highs (${(pricePosition * 100).toFixed(0)}%)`;
          pattern = 'breakout_hot';
        } else if (pricePosition > 0.7 && coin.change24h > 0) {
          action = 'buy';
          confidence = 0.82;
          reason = `🔺 BREAKOUT SCALP: Approaching resistance`;
          pattern = 'breakout_approach';
        }
        break;
        
      case 'volatility_breakout':
        // AGGRESSIVE VOLATILITY - High range = opportunity
        if (volatilityPercent > 5 && pricePosition < 0.35) {
          action = 'buy';
          confidence = 0.9;
          reason = `⚡ VOLATILITY SCALP: ${volatilityPercent.toFixed(1)}% range, low entry`;
          pattern = 'volatility_extreme';
        } else if (volatilityPercent > 3 && pricePosition < 0.45) {
          action = 'buy';
          confidence = 0.8;
          reason = `⚡ VOLATILITY SCALP: ${volatilityPercent.toFixed(1)}% range opportunity`;
          pattern = 'volatility_play';
        }
        break;
        
      case 'grid':
        // AGGRESSIVE GRID - Any lower half entry
        if (pricePosition < 0.35) {
          action = 'buy';
          confidence = 0.85;
          reason = `📊 GRID SCALP: Low in range (${(pricePosition * 100).toFixed(0)}%)`;
          pattern = 'grid_deep';
        } else if (pricePosition < 0.5) {
          action = 'buy';
          confidence = 0.75;
          reason = `📊 GRID SCALP: Below midpoint (${(pricePosition * 100).toFixed(0)}%)`;
          pattern = 'grid_mid';
        }
        break;
        
      case 'dca':
        // AGGRESSIVE DCA - Accumulate on any dip
        if (coin.change24h < -1) {
          action = 'buy';
          confidence = 0.88;
          reason = `💰 DCA SCALP: Dip accumulate (${coin.change24h.toFixed(2)}%)`;
          pattern = 'dca_dip';
        } else if (pricePosition < 0.5) {
          action = 'buy';
          confidence = 0.75;
          reason = `💰 DCA SCALP: Below average (${(pricePosition * 100).toFixed(0)}%)`;
          pattern = 'dca_low';
        }
        break;
        
      default:
        // ULTRA-AGGRESSIVE FALLBACK - Find any edge
        if (coin.change24h > 0.5) {
          action = 'buy';
          confidence = 0.85;
          reason = `🎯 SCALP: Momentum +${coin.change24h.toFixed(2)}%`;
          pattern = 'adaptive_momentum';
        } else if (pricePosition < 0.3) {
          action = 'buy';
          confidence = 0.85;
          reason = `🎯 SCALP: Deep support (${(pricePosition * 100).toFixed(0)}%)`;
          pattern = 'adaptive_support';
        } else if (volatilityPercent > 4) {
          action = 'buy';
          confidence = 0.75;
          reason = `🎯 SCALP: High volatility play`;
          pattern = 'adaptive_volatility';
        }
    }
    
    // SPEED BOOST: Regime multipliers
    if (regime === 'trending') confidence *= AUTONOMOUS_CONFIG.AGGRESSIVE_MULTIPLIER;
    if (regime === 'high_volatility' && (bestStrategy === 'volatility_breakout' || bestStrategy === 'grid')) {
      confidence *= 1.2;
    }
    if (regime === 'ranging' && bestStrategy === 'rsi') confidence *= 1.15;
    
    // Lower threshold for more trades
    if (action !== 'hold' && confidence >= AUTONOMOUS_CONFIG.MIN_CONFIDENCE) {
      const positionValue = balance * (maxPositionSize / 100) * confidence;
      const quantity = positionValue / coin.price;
      
      decisions.push({
        action,
        symbol: coin.symbol,
        reason: `${reason} [${bestStrategy}]`,
        confidence: Math.min(confidence, 0.99),
        suggestedSize: quantity,
        pattern,
      });
    }
  }
  
  // Return MORE trades for speed scalping
  return decisions.sort((a, b) => b.confidence - a.confidence).slice(0, AUTONOMOUS_CONFIG.TOP_TRADES_PER_CYCLE);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if this is a cron call (no auth) or user call (with auth)
    const authHeader = req.headers.get('Authorization');
    let userIds: string[] = [];

    if (authHeader && !authHeader.includes(Deno.env.get('SUPABASE_ANON_KEY') || '')) {
      // Try to get user from JWT
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
        .select('user_id')
        .eq('enabled', true);

      if (aiSettings) {
        userIds = aiSettings.map((s: any) => s.user_id);
      }
    }

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ message: 'No users with AI enabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🤖 AI Trading Engine processing ${userIds.length} user(s)`);
    
    // Process first user (for now - can be expanded to loop through all)
    const userId = userIds[0];
    const user = { id: userId };

    console.log(`🤖 Processing user: ${user.id}`);

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

    // 🛑 KILL SWITCH CHECK - Block all trading if kill switch is active
    if (settings.kill_switch_active) {
      console.log('🛑 KILL SWITCH ACTIVE - Trading blocked until manual reset');
      return new Response(JSON.stringify({ 
        message: 'Kill switch active - trading halted',
        reason: 'Maximum drawdown exceeded. Manual reset required.',
        status: 'kill_switch'
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
      // For live mode, get ACTUAL USDC balance from Coinbase and auto-convert DAI if needed
      const { usdcBalance, daiConverted } = await getAvailableUsdcBalance();
      
      if (daiConverted > 0) {
        console.log(`💰 Auto-converted DAI: +$${daiConverted.toFixed(2)} USDC available`);
      }
      
      balance = usdcBalance;
      console.log(`💵 Actual trading balance: $${balance.toFixed(2)} USDC`);
      
      // Also update the database with actual balance
      await supabase
        .from('live_account')
        .update({ 
          balance: usdcBalance,
          buying_power: usdcBalance,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user.id);
    }

    // 📋 LOG ALL USER PARAMETERS BEING USED
    console.log(`⚙️ YOUR AI TRADER SETTINGS:`);
    console.log(`   Max Capital Usage: ${settings.max_capital_usage || 80}%`);
    console.log(`   Max Position Size: ${settings.max_position_size || 10}%`);
    console.log(`   Max Daily Loss: ${settings.max_daily_loss || 5}%`);
    console.log(`   Max Concurrent Trades: ${settings.max_concurrent_trades || 5}`);
    console.log(`   Max Leverage: ${settings.max_leverage || 3}x`);
    console.log(`   Risk Tolerance: ${settings.risk_tolerance || 'moderate'}`);
    console.log(`   Allowed Markets: ${(settings.allowed_markets || ['crypto']).join(', ')}`);

    // Get current open positions count
    const { count: openPositions } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_paper', isPaperMode);

    if ((openPositions || 0) >= settings.max_concurrent_trades) {
      console.log(`🛑 Max concurrent trades reached (${openPositions}/${settings.max_concurrent_trades})`);
      return new Response(JSON.stringify({ 
        message: 'Max concurrent trades reached',
        openPositions,
        maxAllowed: settings.max_concurrent_trades,
        status: 'at_limit'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 📉 DAILY LOSS CHECK - Stop trading if daily loss limit exceeded
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const { data: todaysTrades } = await supabase
      .from('trades')
      .select('pnl')
      .eq('user_id', user.id)
      .eq('is_paper', isPaperMode)
      .gte('created_at', todayStart.toISOString());
    
    const todaysLoss = (todaysTrades || []).reduce((sum, t) => sum + (t.pnl && t.pnl < 0 ? t.pnl : 0), 0);
    const maxDailyLossAmount = balance * ((settings.max_daily_loss || 5) / 100);
    
    if (Math.abs(todaysLoss) >= maxDailyLossAmount) {
      console.log(`🛑 DAILY LOSS LIMIT HIT: Lost $${Math.abs(todaysLoss).toFixed(2)} (max: $${maxDailyLossAmount.toFixed(2)})`);
      
      await supabase
        .from('ai_settings')
        .update({ bot_status: 'idle', updated_at: new Date().toISOString() })
        .eq('user_id', user.id);
      
      return new Response(JSON.stringify({ 
        message: 'Daily loss limit reached - trading paused',
        todaysLoss: Math.abs(todaysLoss),
        maxDailyLoss: maxDailyLossAmount,
        status: 'daily_limit'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`📊 Daily P&L: $${todaysLoss.toFixed(2)} (limit: -$${maxDailyLossAmount.toFixed(2)})`)

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

    // 🚀 MOONSHOT PRIORITY - Boost coins with high pump probability
    let prioritizedTradeable = tradeable;
    if (settings.prioritize_moonshots) {
      console.log('🚀 Moonshot Priority ENABLED - fetching pump probability scores...');
      
      const { data: moonshotSignals } = await supabase
        .from('moonshot_signals')
        .select('symbol, pump_probability, signal_tags')
        .gte('pump_probability', 60) // Only consider high probability signals
        .order('pump_probability', { ascending: false });
      
      if (moonshotSignals && moonshotSignals.length > 0) {
        console.log(`🎯 Found ${moonshotSignals.length} high-probability moonshots:`);
        moonshotSignals.forEach((s: any) => console.log(`   ${s.symbol}: ${s.pump_probability}% - ${(s.signal_tags || []).join(', ')}`));
        
        // Create a map of symbol -> pump_probability
        const moonshotMap = new Map(moonshotSignals.map((s: any) => [s.symbol, s.pump_probability]));
        
        // Sort tradeable coins by moonshot priority (high pump probability first)
        prioritizedTradeable = [...tradeable].sort((a, b) => {
          const aPump = moonshotMap.get(a.symbol) || 0;
          const bPump = moonshotMap.get(b.symbol) || 0;
          return bPump - aPump; // Higher pump probability first
        });
        
        console.log(`📊 Prioritized order: ${prioritizedTradeable.map(c => {
          const pump = moonshotMap.get(c.symbol);
          return pump ? `${c.symbol}(🚀${pump}%)` : c.symbol;
        }).join(', ')}`);
      } else {
        console.log('📊 No high-probability moonshots found, using standard order');
      }
    }

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

    // 🎯 Get BEST STRATEGY for current regime BEFORE analysis
    const bestStrategy = await getBestStrategyForRegime(supabase, user.id, regime);
    console.log(`🎯 Selected strategy for ${regime}: ${bestStrategy}`);

    // 🧠 AI AUTONOMOUS MODE - Full control with leverage
    const leverage = settings.max_leverage || 3;
    const targetEquity = settings.target_equity || 1000000;
    const optimalLeverage = calculateOptimalLeverage(balance, targetEquity, leverage, settings.risk_tolerance || 'aggressive');
    
    console.log(`🚀 AI Autonomous Mode: ${optimalLeverage}x leverage, $${balance.toFixed(2)} → $${targetEquity} target`);
    let decisions = await analyzeWithAI(prioritizedTradeable, balance, settings.max_position_size, trendAnalysis, bestStrategy, regime, optimalLeverage, targetEquity);
    
    // Fallback to strategy-specific rule-based if AI returns nothing
    if (decisions.length === 0) {
      console.log('📊 AI returned no decisions, using strategy-specific rules');
      decisions = analyzeWithRules(prioritizedTradeable, regime, settings.max_position_size, balance, bestStrategy);
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

    // CRITICAL: Limit decisions to remaining trade slots (respecting max_concurrent_trades)
    const remainingSlots = Math.max(0, settings.max_concurrent_trades - (openPositions || 0));
    console.log(`📊 Trade slots: ${openPositions || 0} used / ${settings.max_concurrent_trades} max = ${remainingSlots} remaining`);
    
    if (remainingSlots === 0) {
      console.log('⚠️ No remaining trade slots - skipping all new trades');
      return new Response(JSON.stringify({
        status: 'at_limit',
        message: 'Max concurrent trades reached',
        openPositions: openPositions || 0,
        maxAllowed: settings.max_concurrent_trades,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Only take as many decisions as we have slots for
    const limitedDecisions = decisions.slice(0, remainingSlots);
    console.log(`✅ Generated ${decisions.length} trading decisions, executing ${limitedDecisions.length} (limited by ${remainingSlots} slots) using ${bestStrategy} strategy`);

    const executedTrades: any[] = [];
    let tradesExecuted = 0;

    // Execute trades (limited to available slots)
    for (const decision of limitedDecisions) {
      // Double-check we haven't exceeded the limit during this loop
      if (tradesExecuted >= remainingSlots) {
        console.log(`🛑 Stopping: Reached max_concurrent_trades limit (${settings.max_concurrent_trades})`);
        break;
      }
      
      if (decision.action === 'hold') continue;
      
      const coinData = marketData.find(m => m.symbol === decision.symbol);
      if (!coinData) continue;

      // 🚀 AUTONOMOUS LEVERAGED TRADING - Uses YOUR configured parameters
      const MIN_TRADE_VALUE = 5.00;
      const decisionLeverage = (decision as any).leverage || optimalLeverage || 1;
      const decisionSizePercent = (decision as any).size_percent || settings.max_position_size || 10;
      
      // Use YOUR max_capital_usage setting (not hardcoded 80%)
      const maxCapitalUsage = settings.max_capital_usage || 80;
      const maxPositionSize = settings.max_position_size || 10;
      const availableCapital = balance * (maxCapitalUsage / 100);
      
      // Calculate position value respecting YOUR max position size setting
      const baseValue = availableCapital * (decisionSizePercent / 100);
      const leveragedNotional = baseValue * decisionLeverage;
      
      // Actual capital used = base value, capped by YOUR max_capital_usage
      const tradeValue = Math.max(Math.min(baseValue * decision.confidence, availableCapital), MIN_TRADE_VALUE);
      let quantity = tradeValue / coinData.price;
      let actualEntryPrice = coinData.price;
      
      console.log(`⚙️ Using YOUR settings: maxCapital=${maxCapitalUsage}%, maxPosition=${maxPositionSize}%, maxTrades=${settings.max_concurrent_trades}`);
      console.log(`📈 Leveraged trade: $${tradeValue.toFixed(2)} × ${decisionLeverage}x = $${(tradeValue * decisionLeverage).toFixed(2)} notional`);

      // STRICT VALIDATION: Skip if trade value, quantity, or price is $0 or invalid
      if (!tradeValue || tradeValue <= 0 || !quantity || quantity <= 0 || !actualEntryPrice || actualEntryPrice <= 0) {
        console.log(`⚠️ SKIPPING invalid trade: ${decision.symbol} - value=$${tradeValue}, qty=${quantity}, price=$${actualEntryPrice}`);
        continue;
      }

      // Skip if we don't have enough balance for minimum anti-dust trade
      if (balance < MIN_TRADE_VALUE) {
        console.log(`⚠️ Insufficient balance ($${balance.toFixed(2)}) for minimum trade ($${MIN_TRADE_VALUE})`);
        continue;
      }
      
      // PRE-VALIDATE: Check if quantity will be 0 after precision rounding BEFORE executing
      const precisionMap: Record<string, number> = {
        'BTC': 8, 'ETH': 8, 'SOL': 4, 'XRP': 0, 'DOGE': 0, 'LTC': 4, 'APT': 2,
        'AVAX': 2, 'LINK': 2, 'UNI': 2, 'ATOM': 2, 'NEAR': 2, 'ARB': 0, 'OP': 2,
        'INJ': 2, 'SEI': 0, 'SUI': 2, 'FIL': 2, 'RENDER': 2, 'AAVE': 4, 'GRT': 0,
        'HBAR': 0, 'XLM': 0, 'ALGO': 0, 'CHZ': 0, 'SHIB': 0, 'PEPE': 0, 'FLOKI': 0,
        'ADA': 0, 'DOT': 2, 'MATIC': 0, 'BCH': 4, 'SAND': 0, 'MANA': 0, 'ENJ': 0,
      };
      const precision = precisionMap[decision.symbol.toUpperCase()] ?? 2;
      const preRoundedQty = Math.floor(quantity * Math.pow(10, precision)) / Math.pow(10, precision);
      const prePositionValue = preRoundedQty * actualEntryPrice;
      
      if (preRoundedQty <= 0 || prePositionValue < 2) {
        console.log(`⚠️ SKIPPING zero-quantity trade: ${decision.symbol} - qty=${quantity} rounds to ${preRoundedQty}, value=$${prePositionValue.toFixed(2)}`);
        continue;
      }
      
      console.log(`✅ Pre-validated: ${decision.symbol} qty=${preRoundedQty} ($${prePositionValue.toFixed(2)})`);

      // 🛡️ RISK MANAGER VALIDATION - Must pass before execution
      // Calculate current open positions value for risk check
      const { data: currentPositions } = await supabase
        .from('positions')
        .select('quantity, avg_entry_price')
        .eq('user_id', user.id)
        .eq('is_paper', isPaperMode);
      
      const openPositionsValue = (currentPositions || []).reduce(
        (sum, p) => sum + (p.quantity * p.avg_entry_price), 
        0
      );
      
      // Default stop loss for live trades (2.5% below entry)
      const defaultStopLoss = isPaperMode ? undefined : actualEntryPrice * 0.975;
      
      const riskValidation = await validateTradeWithRiskManager(
        supabase,
        user.id,
        {
          symbol: decision.symbol,
          side: decision.action as 'buy' | 'sell',
          quantity: preRoundedQty,
          price: actualEntryPrice,
          positionValue: prePositionValue,
          stopLoss: defaultStopLoss,
        },
        balance,
        openPositions || 0,
        openPositionsValue
      );

      if (!riskValidation.approved) {
        console.log(`🛡️ RISK MANAGER BLOCKED: ${decision.symbol} - ${riskValidation.reason}`);
        console.log(`   Violations: ${riskValidation.violations.join(', ')}`);
        continue; // Skip this trade
      }
      
      console.log(`✅ RISK APPROVED: ${decision.symbol} - ${riskValidation.reason}`);

      // 💰 EXECUTE REAL COINBASE BUY if in LIVE mode
      if (!isPaperMode && decision.action === 'buy') {
        console.log(`💰 EXECUTING REAL COINBASE BUY: $${tradeValue.toFixed(2)} of ${decision.symbol}`);
        const buyResult = await executeCoinbaseBuy(decision.symbol, tradeValue);
        
        if (buyResult.success && buyResult.quantity && buyResult.price) {
          quantity = buyResult.quantity;
          actualEntryPrice = buyResult.price;
          
          // DUST PREVENTION: Verify the quantity we received is sellable
          // Apply the same precision/minimum checks we use for selling
          const precisionMap: Record<string, number> = {
            'BTC': 8, 'ETH': 8, 'SOL': 4, 'XRP': 0, 'DOGE': 0, 'LTC': 4, 'APT': 2,
            'AVAX': 2, 'LINK': 2, 'UNI': 2, 'ATOM': 2, 'NEAR': 2, 'ARB': 0, 'OP': 2,
            'INJ': 2, 'SEI': 0, 'SUI': 2, 'FIL': 2, 'RENDER': 2, 'AAVE': 4, 'GRT': 0,
            'HBAR': 0, 'XLM': 0, 'ALGO': 0, 'CHZ': 0, 'SHIB': 0, 'PEPE': 0, 'FLOKI': 0,
          };
          const precision = precisionMap[decision.symbol.toUpperCase()] ?? 2;
          const roundedQty = Math.floor(quantity * Math.pow(10, precision)) / Math.pow(10, precision);
          const positionValue = roundedQty * actualEntryPrice;
          
          if (roundedQty <= 0 || positionValue < 2) {
            console.error(`⚠️ DUST DETECTED: Bought ${quantity} ${decision.symbol} but sellable qty is ${roundedQty} ($${positionValue.toFixed(2)})`);
            console.log(`⚠️ This trade will create dust - skipping position creation`);
            // The buy already happened on Coinbase but we won't track it as a position
            // It will become dust but at least we won't make more dust trades
            continue;
          }
          
          console.log(`✅ REAL TRADE EXECUTED: ${quantity} ${decision.symbol} @ $${actualEntryPrice} (sellable: ${roundedQty})`);
        } else {
          console.error(`❌ REAL BUY FAILED for ${decision.symbol}: ${buyResult.error}`);
          // Skip this trade if real buy failed
          continue;
        }
      }

      // Strategy already determined above - use it for trade tagging
      const strategyType = bestStrategy;

      const tradeData = {
        user_id: user.id,
        symbol: decision.symbol,
        side: decision.action as 'buy' | 'sell',
        quantity,
        entry_price: actualEntryPrice,
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
      const { error: positionError } = await supabase.from('positions').insert({
        user_id: user.id,
        symbol: decision.symbol,
        side: decision.action,
        quantity,
        avg_entry_price: actualEntryPrice,
        current_price: coinData.price,
        market_type: 'crypto',
        is_paper: isPaperMode,
        strategy: strategyType,
        unrealized_pnl: 0,
      });

      if (positionError) {
        console.error(`❌ Error creating position for ${decision.symbol}:`, positionError);
      } else {
        console.log(`📊 Created ${isPaperMode ? 'PAPER' : 'LIVE'} position: ${quantity} ${decision.symbol}`);
      }

      // Update paper account balance (only for paper mode)
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
      
      // Increment counter to respect max_concurrent_trades
      tradesExecuted++;

      console.log(`🎯 Executed ${decision.action} for ${decision.symbol}: ${quantity.toFixed(6)} @ $${coinData.price} | Pattern: ${decision.pattern} | Trades: ${tradesExecuted}/${remainingSlots}`);
    }

    // 📊 UPDATE DRAWDOWN TRACKING after all trades executed
    if (tradesExecuted > 0) {
      const drawdownResult = await updateDrawdownTracking(user.id, balance);
      if (drawdownResult.killSwitchTriggered) {
        console.log('🛑 KILL SWITCH TRIGGERED by drawdown check');
      }
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
      riskManaged: true,
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

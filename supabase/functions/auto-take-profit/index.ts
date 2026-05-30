import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ROTATION MODE - Actively rotate profits from winners into rising assets
// Sell positions with gains and rotate into assets showing upward momentum
const COINBASE_MAKER_FEE = 0.4; // Maker fee per trade
const COINBASE_ROUND_TRIP_FEE = 0.8; // 0.4% buy + 0.4% sell (using limit orders)
 // Rotation threshold: when position gains X%, rotate into rising asset
  // FAST-COMPOUND MODE: maximize trades/day. Targets clear ~0.8% maker round-trip;
  // book small wins quickly and recycle capital into the next mover.
  const ROTATION_PROFIT_THRESHOLD = 1.2; // 1.2% triggers rotation into a fresh mover
  // Stop loss: tighter — small losers must die fast so capital can rotate
  const BASE_STOP_LOSS_PERCENT = -1.5;
  // Trailing stop: arm very fast, exit on tiny giveback (lock the move)
  const TRAILING_STOP_DROP = 0.35; // Sell when current gain is 0.35% below peak gain
  const TRAILING_STOP_MIN_PEAK = 0.6; // Activate trailing as soon as peak ≥ 0.6%
  // Hard take-profit: lock in once gain hits this level regardless of peak/trail
  const HARD_TAKE_PROFIT_PCT = 1.4; // 1.4% gross ≈ 0.6% net after maker fees
  // Minimum momentum for target asset (must be rising)
  const MIN_TARGET_MOMENTUM = 0.5; // Target must have at least 0.5% 24h gain
  // Maximum momentum - avoid buying at the top
  const MAX_TARGET_MOMENTUM = 15.0; // Don't buy if already up 15%+ (too late)

// Latency tracking for dynamic threshold adjustment
interface LatencyMetrics {
  avgLatencyMs: number;
  maxLatencyMs: number;
  recentLatencies: number[];
  slippageBuffer: number; // Percentage buffer to add based on latency
}

const latencyTracker: LatencyMetrics = {
  avgLatencyMs: 0,
  maxLatencyMs: 0,
  recentLatencies: [],
  slippageBuffer: 0,
};

// Measure execution latency and update metrics
function trackLatency(startTime: number): number {
  const latencyMs = Date.now() - startTime;
  latencyTracker.recentLatencies.push(latencyMs);
  
  // Keep only last 20 measurements
  if (latencyTracker.recentLatencies.length > 20) {
    latencyTracker.recentLatencies.shift();
  }
  
  // Calculate rolling average
  latencyTracker.avgLatencyMs = latencyTracker.recentLatencies.reduce((a, b) => a + b, 0) / latencyTracker.recentLatencies.length;
  latencyTracker.maxLatencyMs = Math.max(...latencyTracker.recentLatencies);
  
  // Calculate slippage buffer: ~0.01% per 100ms of latency (crypto moves fast)
  // Max 0.05% buffer to prevent over-adjustment
  latencyTracker.slippageBuffer = Math.min(0.05, (latencyTracker.avgLatencyMs / 100) * 0.01);
  
  console.log(`⏱️ Latency: ${latencyMs}ms (avg: ${latencyTracker.avgLatencyMs.toFixed(0)}ms, buffer: +${(latencyTracker.slippageBuffer * 100).toFixed(3)}%)`);
  
  return latencyMs;
}

// Get adjusted rotation threshold accounting for latency slippage
function getAdjustedRotationThreshold(): number {
  const adjusted = ROTATION_PROFIT_THRESHOLD + latencyTracker.slippageBuffer;
  return adjusted;
}

// Get adjusted stop-loss threshold accounting for latency slippage
function getAdjustedStopLoss(): number {
  // Widen stop-loss slightly during high latency to avoid false triggers
  const adjusted = BASE_STOP_LOSS_PERCENT - latencyTracker.slippageBuffer;
  return adjusted;
}

// Milestone system - REAL PRODUCTION VALUES
// Phase 1: Compound until $200k equity, then at each $100k milestone, keep $100k trading, withdraw rest
// Phase 2: At $1M, keep $500k for trading, withdraw $500k at each milestone
const PHASE_1_TARGET = 200000; // $200k target for Phase 1 milestone
const KEEP_FOR_TRADING = 100000; // After target, keep $100k for trading
const WITHDRAWAL_AMOUNT = 100000; // After target, withdraw profits above $100k

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

// Fetch live price + 24h change. Coinbase Exchange first (real-time, matches our
// venue), then CoinGecko for any long-tail symbols Coinbase doesn't list.
async function fetchPriceChanges(symbols: string[]): Promise<Record<string, { price: number; change24h: number }>> {
  const result: Record<string, { price: number; change24h: number }> = {};

  // 1) PRIMARY: Coinbase Exchange ticker + stats (real-time, no rate limits)
  await Promise.all(symbols.map(async (symbol) => {
    const sym = symbol.toUpperCase();
    for (const quote of ['USD', 'USDC']) {
      try {
        const [tickerRes, statsRes] = await Promise.all([
          fetch(`https://api.exchange.coinbase.com/products/${sym}-${quote}/ticker`),
          fetch(`https://api.exchange.coinbase.com/products/${sym}-${quote}/stats`),
        ]);
        if (!tickerRes.ok) continue;
        const ticker = await tickerRes.json();
        const price = Number(ticker?.price) || 0;
        if (price <= 0) continue;
        let change24h = 0;
        if (statsRes.ok) {
          const stats = await statsRes.json();
          const open = Number(stats?.open) || 0;
          const last = Number(stats?.last) || price;
          if (open > 0) change24h = ((last - open) / open) * 100;
        }
        result[sym] = { price, change24h };
        return;
      } catch (err) {
        // try next quote
      }
    }
  }));

  // 2) FALLBACK: CoinGecko for symbols Coinbase doesn't list
  const missing = symbols.filter(s => !result[s.toUpperCase()]);
  const ids = missing
    .map(s => SYMBOL_TO_COINGECKO[s.toUpperCase()])
    .filter(Boolean);

  if (ids.length > 0) {
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`
      );

      if (response.ok) {
        const data = await response.json();
        for (const symbol of missing) {
          const geckoId = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
          if (geckoId && data[geckoId]) {
            result[symbol.toUpperCase()] = {
              price: data[geckoId].usd || 0,
              change24h: data[geckoId].usd_24h_change || 0,
            };
          }
        }
      }
    } catch (error) {
      console.error('CoinGecko fallback failed in fetchPriceChanges:', error);
    }
  }

  return result;
}


// Fetch available trading pairs from Coinbase
async function fetchAvailablePairs(): Promise<Set<string>> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  
  if (!apiKey || !apiSecret) return new Set();
  
  try {
    const uri = `GET api.coinbase.com/api/v3/brokerage/products`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/products?product_type=SPOT', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) return new Set();
    
    const data = await response.json();
    const pairs = new Set<string>();
    
    if (data.products && Array.isArray(data.products)) {
      for (const product of data.products) {
        if (product.product_id && product.status === 'online') {
          pairs.add(product.product_id);
        }
      }
    }
    
    console.log(`📊 Loaded ${pairs.size} available trading pairs`);
    return pairs;
  } catch (error) {
    console.error('Error fetching pairs:', error);
    return new Set();
  }
}

// Execute direct crypto-to-crypto conversion on Coinbase
async function executeCryptoToCryptoSwap(
  fromSymbol: string, 
  toSymbol: string, 
  quantity: number
): Promise<{ success: boolean; receivedQuantity?: number; error?: string }> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    return { success: false, error: 'API keys not configured' };
  }
  
  try {
    // Check if direct pair exists (e.g., BTC-ETH)
    const productId = `${fromSymbol}-${toSymbol}`;
    const uri = `POST api.coinbase.com/api/v3/brokerage/orders`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    
    const precisionMap: Record<string, number> = {
      'BTC': 8, 'ETH': 8, 'SOL': 6, 'XRP': 2, 'DOGE': 2, 'LTC': 6, 'APT': 4,
      'AVAX': 4, 'LINK': 4, 'UNI': 4, 'ATOM': 4, 'NEAR': 4, 'ARB': 2, 'OP': 4,
      'INJ': 4, 'SEI': 2, 'SUI': 4, 'FIL': 4, 'RENDER': 4, 'AAVE': 6, 'GRT': 2,
      'HBAR': 2, 'XLM': 2, 'ALGO': 2, 'CHZ': 2, 'SHIB': 0, 'PEPE': 0, 'FLOKI': 0,
    };
    
    const precision = precisionMap[fromSymbol.toUpperCase()] ?? 4;
    const roundedQty = Math.floor(quantity * Math.pow(10, precision)) / Math.pow(10, precision);
    
    if (roundedQty <= 0) {
      return { success: false, error: 'Quantity zero after rounding' };
    }
    
    const orderId = crypto.randomUUID();
    const orderBody = {
      client_order_id: orderId,
      product_id: productId,
      side: 'SELL', // Selling fromSymbol to get toSymbol
      order_configuration: {
        market_market_ioc: {
          base_size: roundedQty.toFixed(precision)
        }
      }
    };
    
    console.log(`🔄 Converting ${roundedQty} ${fromSymbol} → ${toSymbol}...`);
    
    const execStart = Date.now();
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    
    const result = await response.json();
    const latencyMs = trackLatency(execStart);
    
    if (response.ok && result.success) {
      const filledValue = parseFloat(result.order?.filled_value || '0');
      console.log(`✅ Converted ${fromSymbol} → ${filledValue} ${toSymbol} (${latencyMs}ms)`);
      return { success: true, receivedQuantity: filledValue };
    } else {
      const errorMsg = result.error_response?.message || result.error || 'Swap failed';
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
    
    const precisionMap: Record<string, number> = {
      'BTC': 8, 'ETH': 8, 'SOL': 6, 'XRP': 2, 'BNB': 6, 'ADA': 2, 'AVAX': 4,
      'DOT': 4, 'LINK': 4, 'MATIC': 2, 'POL': 2, 'UNI': 4, 'LTC': 6, 'ATOM': 4,
      'NEAR': 4, 'APT': 4, 'ARB': 2, 'OP': 4, 'INJ': 4, 'TIA': 4, 'SEI': 2,
      'SUI': 4, 'TON': 4, 'ICP': 4, 'FIL': 4, 'RENDER': 4, 'FET': 2, 'TAO': 6,
      'AAVE': 6, 'MKR': 6, 'GRT': 2, 'LDO': 4, 'CRV': 2, 'IMX': 2, 'STX': 2,
      'HBAR': 2, 'XLM': 2, 'ALGO': 2, 'VET': 2, 'ETC': 6, 'BCH': 6, 'TRX': 2,
      'DOGE': 2, 'SHIB': 0, 'PEPE': 0, 'FLOKI': 0, 'BONK': 0, 'WIF': 4, 'MEME': 0,
      'GALA': 2, 'SAND': 2, 'MANA': 2, 'AXS': 4, 'ENJ': 2, 'CHZ': 2, 'APE': 4,
      'CAKE': 4, 'COMP': 6, 'SNX': 4, 'DYDX': 4, 'GMX': 6, '1INCH': 2, 'BAT': 2,
      'ZRX': 2, 'LRC': 2, 'ENS': 6, 'RPL': 6, 'BLUR': 2, 'JUP': 2, 'ONDO': 4,
      'PYTH': 2, 'WLD': 4, 'THETA': 4, 'FTM': 2, 'RUNE': 4, 'KAVA': 4,
      'EOS': 4, 'NEO': 4, 'XTZ': 4, 'QTUM': 4, 'ICX': 2, 'ZIL': 2, 'ONE': 2,
      'CELO': 4, 'ANKR': 2, 'SKL': 2, 'STORJ': 4, 'OCEAN': 2, 'MINA': 4,
      'EGLD': 6, 'FLOW': 4, 'CFX': 2, 'IOTA': 2, 'XEC': 0, 'KAS': 2, 'MNT': 2,
      'CRO': 2, 'OKB': 4, 'LEO': 4, 'DAI': 4,
    };
    const precision = precisionMap[symbol.toUpperCase()] ?? 2;
    const roundedQty = Math.floor(quantity * Math.pow(10, precision)) / Math.pow(10, precision);
    
    if (roundedQty <= 0) {
      return { success: false, error: 'Quantity zero after rounding - dust position' };
    }
    
    const MIN_SELL_QUANTITY: Record<string, number> = {
      'BTC': 0.00001, 'ETH': 0.0001, 'SOL': 0.001, 'XRP': 1, 'DOGE': 10,
      'LTC': 0.001, 'APT': 0.1, 'ONDO': 1, 'CHZ': 10, 'FLOKI': 10000,
      'HBAR': 1, 'WLD': 0.1, 'XLM': 1, 'SHIB': 100000, 'PEPE': 100000,
    };
    const minQty = MIN_SELL_QUANTITY[symbol.toUpperCase()] ?? 0.01;
    if (roundedQty < minQty) {
      return { success: false, error: `Quantity ${roundedQty} below minimum ${minQty} - dust position` };
    }
    
    // First get current price for limit order
    const priceResponse = await fetch(`https://api.coinbase.com/api/v3/brokerage/products/${productId}/ticker`, {
      headers: { 'Authorization': `Bearer ${jwt}` },
    });
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.price || '0');
    
    if (currentPrice <= 0) {
      // Fallback to market order if can't get price
      console.log(`⚠️ Could not get price for ${symbol}, using market order`);
    }
    
    const orderId = crypto.randomUUID();
    
    // Use LIMIT order with post_only for MAKER fees (0.4% vs 0.6% taker)
    // Set price at current market to maximize fill chance while getting maker fee
    const orderBody = currentPrice > 0 ? {
      client_order_id: orderId,
      product_id: productId,
      side: 'SELL',
      order_configuration: {
        limit_limit_gtc: {
          base_size: roundedQty.toFixed(precision),
          limit_price: currentPrice.toFixed(8), // Sell at current price
          post_only: true // Ensures maker fee (0.4%)
        }
      }
    } : {
      // Fallback market order
      client_order_id: orderId,
      product_id: productId,
      side: 'SELL',
      order_configuration: {
        market_market_ioc: {
          base_size: roundedQty.toFixed(precision)
        }
      }
    };
    
    console.log(`📤 LIMIT SELL ${roundedQty} ${symbol} @ $${currentPrice.toFixed(4)} (maker fee: 0.4%)...`);
    
    const execStart = Date.now();
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    
    const result = await response.json();
    const latencyMs = trackLatency(execStart);
    console.log(`📋 Coinbase sell response for ${symbol} (${latencyMs}ms):`, JSON.stringify(result).substring(0, 500));
    
    if (response.ok && result.success) {
      const filledValue = parseFloat(result.order?.filled_value || result.order?.total_value_after_fees || '0');
      const filledSize = parseFloat(result.order?.filled_size || '0');
      console.log(`✅ SOLD ${filledSize} ${symbol} for $${filledValue.toFixed(2)} USDC (${latencyMs}ms)`);
      return { success: true, usdValue: filledValue };
    } else {
      const errorMsg = result.error_response?.message || result.error_response?.preview_failure_reason || result.error || 'Order failed';
      console.error(`❌ Coinbase sell failed for ${symbol}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error(`❌ Coinbase sell error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// AGGRESSIVE sell - attempts to sell ANY quantity, bypasses minimum checks
// Used for "Sell All" to liquidate even dust positions
async function executeCoinbaseSellAggressive(symbol: string, quantity: number): Promise<{ success: boolean; usdValue?: number; error?: string }> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    return { success: false, error: 'API keys not configured' };
  }
  
  try {
    const productId = `${symbol}-USDC`;
    const uri = `POST api.coinbase.com/api/v3/brokerage/orders`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    
    // Coinbase precision requirements - use CONSERVATIVE (fewer) decimals for dust sells
    // Many coins only accept 0-2 decimal places for small amounts
    const precisionMap: Record<string, number> = {
      'BTC': 8, 'ETH': 8, 'SOL': 4, 'XRP': 0, 'BNB': 4, 'ADA': 0, 'AVAX': 2,
      'DOT': 2, 'LINK': 2, 'MATIC': 0, 'POL': 0, 'UNI': 2, 'LTC': 4, 'ATOM': 2,
      'NEAR': 2, 'APT': 2, 'ARB': 0, 'OP': 2, 'INJ': 2, 'TIA': 2, 'SEI': 0,
      'SUI': 2, 'TON': 2, 'ICP': 2, 'FIL': 2, 'RENDER': 2, 'FET': 0, 'TAO': 4,
      'AAVE': 4, 'MKR': 4, 'GRT': 0, 'LDO': 2, 'CRV': 0, 'IMX': 0, 'STX': 0,
      'HBAR': 0, 'XLM': 0, 'ALGO': 0, 'VET': 0, 'ETC': 4, 'BCH': 4, 'TRX': 0,
      'DOGE': 0, 'SHIB': 0, 'PEPE': 0, 'FLOKI': 0, 'BONK': 0, 'WIF': 2, 'MEME': 0,
      'GALA': 0, 'SAND': 0, 'MANA': 0, 'AXS': 2, 'ENJ': 0, 'CHZ': 0, 'APE': 2,
      'CAKE': 2, 'COMP': 4, 'SNX': 2, 'DYDX': 2, 'GMX': 4, '1INCH': 0, 'BAT': 0,
      'ZRX': 0, 'LRC': 0, 'ENS': 4, 'RPL': 4, 'BLUR': 0, 'JUP': 0, 'ONDO': 2,
      'PYTH': 0, 'WLD': 2, 'THETA': 2, 'FTM': 0, 'RUNE': 2, 'KAVA': 2,
      'EOS': 2, 'NEO': 2, 'XTZ': 2, 'QTUM': 2, 'ICX': 0, 'ZIL': 0, 'ONE': 0,
      'CELO': 2, 'ANKR': 0, 'SKL': 0, 'STORJ': 2, 'OCEAN': 0, 'MINA': 2,
      'EGLD': 4, 'FLOW': 2, 'CFX': 0, 'IOTA': 0, 'XEC': 0, 'KAS': 0, 'MNT': 0,
      'CRO': 0, 'OKB': 2, 'LEO': 2, 'DAI': 2,
    };
    const precision = precisionMap[symbol.toUpperCase()] ?? 2; // Default to 2 for unknown
    const roundedQty = Math.floor(quantity * Math.pow(10, precision)) / Math.pow(10, precision);
    
    if (roundedQty <= 0) {
      return { success: false, error: 'Quantity zero after rounding' };
    }
    
    // NO MINIMUM CHECK - attempt to sell any amount
    const orderId = crypto.randomUUID();
    const orderBody = {
      client_order_id: orderId,
      product_id: productId,
      side: 'SELL',
      order_configuration: {
        market_market_ioc: {
          base_size: roundedQty.toFixed(precision)
        }
      }
    };
    
    console.log(`📤 AGGRESSIVE SELL: ${roundedQty} ${symbol} (precision: ${precision})...`);
    
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    
    const result = await response.json();
    console.log(`📋 Aggressive sell response for ${symbol}:`, JSON.stringify(result).substring(0, 500));
    
    if (response.ok && result.success) {
      const filledValue = parseFloat(result.order?.filled_value || result.order?.total_value_after_fees || '0');
      const filledSize = parseFloat(result.order?.filled_size || '0');
      console.log(`✅ AGGRESSIVE SOLD ${filledSize} ${symbol} for $${filledValue.toFixed(2)} USDC`);
      return { success: true, usdValue: filledValue };
    } else {
      const errorMsg = result.error_response?.message || result.error_response?.preview_failure_reason || result.error || 'Order failed';
      console.error(`❌ Aggressive sell failed for ${symbol}:`, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    console.error(`❌ Aggressive sell error:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Fetch all Coinbase crypto holdings
async function fetchCoinbaseHoldings(): Promise<Array<{ symbol: string; quantity: number; value: number }>> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    console.log('⚠️ Coinbase API keys not configured');
    return [];
  }
  
  try {
    const uri = `GET api.coinbase.com/api/v3/brokerage/accounts`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/accounts', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error('Failed to fetch Coinbase accounts:', response.status);
      return [];
    }
    
    const data = await response.json();
    const holdings: Array<{ symbol: string; quantity: number; value: number }> = [];
    
    const stablecoins = ['USD', 'USDC', 'USDT', 'DAI', 'BUSD'];
    
    if (data.accounts && Array.isArray(data.accounts)) {
      for (const account of data.accounts) {
        const currency = account.currency || '';
        const balance = parseFloat(account.available_balance?.value || '0');
        
        // Skip stablecoins and zero balances
        if (balance > 0 && !stablecoins.includes(currency.toUpperCase())) {
          // Estimate USD value (will be updated with actual market price)
          holdings.push({
            symbol: currency.toUpperCase(),
            quantity: balance,
            value: 0, // Will calculate later
          });
          console.log(`📊 Found holding: ${balance} ${currency}`);
        }
      }
    }
    
    return holdings;
  } catch (error) {
    console.error('Error fetching Coinbase holdings:', error);
    return [];
  }
}

// Sell all crypto holdings on Coinbase and convert to USDC
async function sellAllCoinbaseHoldings(): Promise<{ sold: Array<{ symbol: string; quantity: number; usdValue: number }>; errors: string[] }> {
  const holdings = await fetchCoinbaseHoldings();
  const sold: Array<{ symbol: string; quantity: number; usdValue: number }> = [];
  const errors: string[] = [];
  
  console.log(`🔄 Found ${holdings.length} crypto holdings to sell`);
  
  for (const holding of holdings) {
    console.log(`💰 Selling ${holding.quantity} ${holding.symbol}...`);
    const result = await executeCoinbaseSell(holding.symbol, holding.quantity);
    
    if (result.success) {
      sold.push({
        symbol: holding.symbol,
        quantity: holding.quantity,
        usdValue: result.usdValue || 0,
      });
      console.log(`✅ Sold ${holding.symbol} for $${result.usdValue?.toFixed(2)}`);
    } else {
      errors.push(`${holding.symbol}: ${result.error}`);
      console.error(`❌ Failed to sell ${holding.symbol}: ${result.error}`);
    }
  }
  
  return { sold, errors };
}

async function fetchLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  // 1) PRIMARY: Coinbase Exchange — real-time and matches our execution venue exactly.
  //    This is what decides take-profit / stop-loss, so we want the same tick the
  //    sell order will hit, not a cached CoinGecko price.
  await Promise.all(symbols.map(async (sym) => {
    const upper = sym.toUpperCase();
    for (const quote of ['USD', 'USDC']) {
      try {
        const res = await fetch(`https://api.exchange.coinbase.com/products/${upper}-${quote}/ticker`);
        if (res.ok) {
          const data = await res.json();
          const price = Number(data?.price);
          if (price > 0) {
            prices[upper] = price;
            return;
          }
        }
      } catch (err) {
        // try next quote
      }
    }
  }));

  // 2) FALLBACK: CoinGecko for anything Coinbase doesn't list
  const missing = symbols.filter(s => !prices[s.toUpperCase()]);
  const ids = missing
    .map(s => SYMBOL_TO_COINGECKO[s.toUpperCase()])
    .filter(Boolean);

  if (ids.length === 0) return prices;

  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
    );

    if (response.ok) {
      const data = await response.json();
      for (const symbol of missing) {
        const geckoId = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
        if (geckoId && data[geckoId]?.usd) {
          prices[symbol.toUpperCase()] = data[geckoId].usd;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching prices (CoinGecko fallback):', error);
  }

  return prices;
}


// Stock sell stub (removed Alpaca integration)
async function executeAlpacaSell(_symbol: string, _quantity: number, _userId: string, _supabase: any): Promise<{ success: boolean; usdValue?: number; error?: string }> {
  return { success: false, error: 'Alpaca integration removed' };
}

// Execute stock sell on Tradier
async function executeTradierSell(symbol: string, quantity: number, userId: string, supabase: any): Promise<{ success: boolean; usdValue?: number; error?: string }> {
  try {
    // Get user's Tradier credentials
    const { data: creds } = await supabase
      .from('broker_credentials')
      .select('access_token_encrypted')
      .eq('user_id', userId)
      .eq('provider', 'tradier')
      .single();
    
    if (!creds?.access_token_encrypted) {
      return { success: false, error: 'Tradier credentials not found' };
    }
    
    // Get account ID first
    const accountsResponse = await fetch('https://api.tradier.com/v1/user/profile', {
      headers: {
        'Authorization': `Bearer ${creds.access_token_encrypted}`,
        'Accept': 'application/json',
      },
    });
    
    if (!accountsResponse.ok) {
      return { success: false, error: 'Failed to get Tradier account' };
    }
    
    const accountData = await accountsResponse.json();
    const accountId = accountData.profile?.account?.account_number;
    
    if (!accountId) {
      return { success: false, error: 'No Tradier account found' };
    }
    
    // Submit market sell order
    const response = await fetch(`https://api.tradier.com/v1/accounts/${accountId}/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${creds.access_token_encrypted}`,
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        class: 'equity',
        symbol: symbol,
        side: 'sell',
        quantity: quantity.toString(),
        type: 'market',
        duration: 'day',
      }),
    });
    
    if (!response.ok) {
      const errText = await response.text();
      return { success: false, error: `Tradier error: ${errText}` };
    }
    
    const order = await response.json();
    console.log(`✅ Tradier sell order submitted: ${symbol} x${quantity}`);
    
    return { success: true, usdValue: 0 }; // Value updated on fill
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Fetch stock prices from a free API
async function fetchStockPrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  if (symbols.length === 0) return prices;
  
  try {
    // Use Yahoo Finance API (unofficial but reliable)
    for (const symbol of symbols) {
      try {
        const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=1d`);
        if (response.ok) {
          const data = await response.json();
          const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price) {
            prices[symbol.toUpperCase()] = price;
          }
        }
      } catch {
        // Skip individual symbol errors
      }
    }
  } catch (error) {
    console.error('Error fetching stock prices:', error);
  }
  
  return prices;
}

async function processUserPositions(supabase: any, userId: string, isPaperMode: boolean, availablePairs: Set<string>) {
  console.log(`Processing user: ${userId}, paper mode: ${isPaperMode}`);

  // Load per-user scalp settings (TP / trailing / hard stop). Fallback to module defaults.
  const { data: scalpRow } = await supabase
    .from('scalp_settings')
    .select('take_profit_pct, trailing_drop_pct, hard_stop_loss_pct')
    .eq('user_id', userId)
    .maybeSingle();
  const rawTakeProfitPct = Number(scalpRow?.take_profit_pct) > 0 ? Number(scalpRow.take_profit_pct) : HARD_TAKE_PROFIT_PCT;
  // 💸 LIVE FEE BUFFER: live trades pay ~0.4% maker buy + ~0.4% maker sell (worse on taker fills)
  // plus slippage. Add a ~1.0% buffer to TP in live so a "win" actually clears fees.
  // Paper has no fees → use raw config so paper matches user expectations.
  const LIVE_FEE_BUFFER_PCT = 1.0;
  const cfgTakeProfitPct = isPaperMode ? rawTakeProfitPct : (rawTakeProfitPct + LIVE_FEE_BUFFER_PCT);
  const cfgTrailingDropPct = Number(scalpRow?.trailing_drop_pct) > 0 ? Number(scalpRow.trailing_drop_pct) : TRAILING_STOP_DROP;
  const cfgHardStopLossPct = Number(scalpRow?.hard_stop_loss_pct) > 0 ? -Math.abs(Number(scalpRow.hard_stop_loss_pct)) : BASE_STOP_LOSS_PERCENT;
  console.log(`⚙️ Exit cfg for ${userId} (${isPaperMode ? 'PAPER' : 'LIVE'}): TP=${cfgTakeProfitPct}%${isPaperMode ? '' : ` (raw ${rawTakeProfitPct}% + ${LIVE_FEE_BUFFER_PCT}% fee buffer)`} TrailDrop=${cfgTrailingDropPct}% HardStop=${cfgHardStopLossPct}%`);

  // Fetch ALL open positions for this user (both crypto AND stocks)
  const { data: positions, error: posError } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_paper', isPaperMode);

  if (posError || !positions || positions.length === 0) {
    return { takeProfitCount: 0, stopLossCount: 0, conversions: 0 };
  }

  // Separate positions by market type
  const cryptoPositions = positions.filter((p: any) => p.market_type === 'crypto');
  const stockPositions = positions.filter((p: any) => p.market_type === 'stocks');
  
  // Fetch live prices for crypto
  const cryptoSymbols: string[] = [...new Set(cryptoPositions.map((p: any) => p.symbol))] as string[];
  const cryptoPrices = await fetchLivePrices(cryptoSymbols);
  
  // Fetch live prices for stocks
  const stockSymbols: string[] = [...new Set(stockPositions.map((p: any) => p.symbol))] as string[];
  const stockPrices = await fetchStockPrices(stockSymbols);
  
  // Merge all prices
  const livePrices = { ...cryptoPrices, ...stockPrices };

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

  // Phase-based milestone system:
  // Phase 1: Accumulate USDC until $200 is reached
  // Phase 2: At $200, split: keep $100 for trading, mark $100 as profit
  const hasReachedTarget = totalEquity >= PHASE_1_TARGET;

  // Handle milestone reached - when equity >= $200, split it
  if (hasReachedTarget) {
    console.log(`🎉 MILESTONE for user ${userId}! Equity: $${totalEquity.toFixed(2)} >= $${PHASE_1_TARGET}`);
    console.log(`💰 Splitting: Keep $${KEEP_FOR_TRADING} for trading, withdraw $${WITHDRAWAL_AMOUNT} as profit`);
    
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
      
      // Execute REAL sell based on market type
      if (!isPaperMode) {
        const isStock = position.market_type === 'stocks';
        console.log(`💰 Executing REAL ${isStock ? 'stock' : 'crypto'} sell: ${quantity} ${position.symbol}`);
        
        let sellResult: { success: boolean; usdValue?: number; error?: string };
        if (isStock) {
          // Try Alpaca first, then Tradier
          sellResult = await executeAlpacaSell(position.symbol, quantity, userId, supabase);
          if (!sellResult.success) {
            sellResult = await executeTradierSell(position.symbol, quantity, userId, supabase);
          }
        } else {
          sellResult = await executeCoinbaseSell(position.symbol, quantity);
        }
        
        if (sellResult.success && sellResult.usdValue) {
          actualExitPrice = sellResult.usdValue / quantity;
          pnl = sellResult.usdValue - (entryPrice * quantity);
          console.log(`✅ Real sell completed: ${position.symbol} -> $${sellResult.usdValue.toFixed(2)}`);
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

    // Update balance to keep $100 for trading (the rest is "withdrawn")
    if (isPaperMode) {
      await supabase.from('paper_account').update({ balance: KEEP_FOR_TRADING, updated_at: new Date().toISOString() }).eq('user_id', userId);
    } else {
      await supabase.from('live_account').update({ balance: KEEP_FOR_TRADING, updated_at: new Date().toISOString() }).eq('user_id', userId);
    }

    await supabase.from('ai_decisions').insert({
      user_id: userId,
      decision_type: 'milestone_reached',
      action: 'withdraw_and_reinvest',
      reasoning: `🎉 Reached $${totalEquity.toFixed(2)}! Withdrew $${WITHDRAWAL_AMOUNT}, kept $${KEEP_FOR_TRADING} for trading. Cycle restarts.`,
    });

    return { takeProfitCount: positions.length, stopLossCount: 0, milestone: true };
  }

  // Process individual take-profit/stop-loss
  let takeProfitCount = 0;
  let stopLossCount = 0;
  let conversions = 0;

  for (const position of positions) {
    const currentPrice = livePrices[position.symbol.toUpperCase()] || position.current_price;
    if (!currentPrice) continue;

    const entryPrice = Number(position.avg_entry_price);
    const quantity = Number(position.quantity);
    const positionValue = currentPrice * quantity;
    
    // Handle positions with $0 entry price (synced from broker)
    // These are REAL holdings that should be sold when profitable!
    if (entryPrice <= 0) {
      // For legacy positions, sell if position is worth >= $10 and we don't have much cash
      // This unlocks capital that's stuck in old positions
      const shouldSellLegacy = positionValue >= 10; // Sell if worth $10+
      
      if (shouldSellLegacy) {
        const isStock = position.market_type === 'stocks';
        console.log(`💰 ${isPaperMode ? 'PAPER ' : ''}SELLING LEGACY POSITION: ${quantity} ${position.symbol} worth $${positionValue.toFixed(2)} (no entry price, ${isStock ? 'stock' : 'crypto'})`);

        let sellResult: { success: boolean; usdValue?: number; error?: string };
        if (isPaperMode) {
          // Simulate liquidation at current mid price
          sellResult = { success: true, usdValue: positionValue };
        } else if (isStock) {
          sellResult = await executeAlpacaSell(position.symbol, quantity, userId, supabase);
          if (!sellResult.success) {
            sellResult = await executeTradierSell(position.symbol, quantity, userId, supabase);
          }
        } else {
          sellResult = await executeCoinbaseSell(position.symbol, quantity);
        }

        if (sellResult.success && (sellResult.usdValue || isStock)) {
          const soldValue = sellResult.usdValue || positionValue;
          console.log(`✅ Legacy position ${isPaperMode ? 'simulated-' : ''}sold: ${position.symbol} -> $${soldValue.toFixed(2)}`);

          // Close trade and delete position
          await supabase.from('trades').update({
            status: 'closed',
            exit_price: currentPrice,
            pnl: soldValue, // Treat entire value as profit since no cost basis
            closed_at: new Date().toISOString(),
          }).eq('user_id', userId).eq('symbol', position.symbol).eq('is_paper', isPaperMode).eq('status', 'open');

          await supabase.from('positions').delete().eq('id', position.id);
          takeProfitCount++;

          // Credit paper balance with realized proceeds
          if (isPaperMode) {
            const { data: paperAccount } = await supabase.from('paper_account').select('balance').eq('user_id', userId).single();
            if (paperAccount) {
              await supabase.from('paper_account').update({
                balance: Number(paperAccount.balance) + soldValue,
                updated_at: new Date().toISOString(),
              }).eq('user_id', userId);
            }
          }

          await supabase.from('ai_decisions').insert({
            user_id: userId,
            decision_type: 'legacy_position_sold',
            symbol: position.symbol,
            action: 'sell',
            reasoning: `${isPaperMode ? '[PAPER] ' : ''}Sold legacy position (no entry price): ${quantity.toFixed(6)} ${position.symbol} for $${soldValue.toFixed(2)}`,
          });
        } else {
          console.log(`⚠️ Could not sell legacy ${position.symbol}: ${sellResult.error}`);
          await supabase.from('positions').update({
            current_price: currentPrice,
            updated_at: new Date().toISOString(),
          }).eq('id', position.id);
        }
      } else {
        // Just update current price for small legacy positions
        await supabase.from('positions').update({
          current_price: currentPrice,
          updated_at: new Date().toISOString(),
        }).eq('id', position.id);
      }

      continue;
    }
    
    let pnlPercent = 0;
    let pnl = 0;
    
    if (position.side === 'buy') {
      pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      pnl = (currentPrice - entryPrice) * quantity;
    } else {
      pnlPercent = ((entryPrice - currentPrice) / entryPrice) * 100;
      pnl = (entryPrice - currentPrice) * quantity;
    }

    // Use latency-adjusted thresholds - ROTATION MODE
    const rotationThreshold = getAdjustedRotationThreshold();
    // Per-user hard stop adjusted for execution-latency slippage (widen slightly under high latency).
    const adjustedStopLoss = cfgHardStopLossPct - latencyTracker.slippageBuffer;

    // TRUE TRAILING STOP LOGIC
    // Track peak PnL and sell when current drops cfgTrailingDropPct below peak
    const previousPeakPnl = Number(position.peak_pnl_percent || 0);
    const newPeakPnl = Math.max(previousPeakPnl, pnlPercent);

    // Check if trailing stop triggered:
    // 1. Peak must be at least TRAILING_STOP_MIN_PEAK (e.g., 0.8%) to activate
    // 2. Current PnL must be cfgTrailingDropPct below peak
    const trailingStopActive = newPeakPnl >= TRAILING_STOP_MIN_PEAK;
    const dropFromPeak = newPeakPnl - pnlPercent;
    const hitTrailingStop = trailingStopActive && dropFromPeak >= cfgTrailingDropPct;

    const hitHardTakeProfit = pnlPercent >= cfgTakeProfitPct;
    const hitRotationTarget = pnlPercent >= rotationThreshold;
    const hitStopLoss = pnlPercent <= adjustedStopLoss;

    // Log position status for monitoring (even when not triggering)
    const statusIcon = hitHardTakeProfit ? '💰' : hitRotationTarget ? '🔄' : hitTrailingStop ? '📉' : hitStopLoss ? '🛑' : '👀';
    const distToRotate = (rotationThreshold - pnlPercent).toFixed(2);
    const distToStop = (pnlPercent - adjustedStopLoss).toFixed(2);
    const peakInfo = trailingStopActive ? ` | Peak: ${newPeakPnl.toFixed(2)}% (drop: ${dropFromPeak.toFixed(2)}%)` : '';
    console.log(`${statusIcon} ${position.symbol}: ${pnlPercent.toFixed(2)}% | Entry: $${entryPrice.toFixed(4)} | Now: $${currentPrice.toFixed(4)} | Rotate in: +${distToRotate}% | Stop in: -${distToStop}%${peakInfo}`);

    // Trigger sell on: hard take-profit, rotation target, trailing stop, or hard stop loss
    if (hitHardTakeProfit || hitRotationTarget || hitTrailingStop || hitStopLoss) {
      const triggerReason = hitHardTakeProfit ? `💰 HARD TAKE-PROFIT (${pnlPercent.toFixed(2)}% ≥ ${cfgTakeProfitPct}%)` : hitRotationTarget ? '🔄 ROTATE TRIGGERED' : hitTrailingStop ? `📉 TRAILING STOP (peak: ${newPeakPnl.toFixed(2)}%, dropped ${dropFromPeak.toFixed(2)}%)` : '🛑 STOP TRIGGERED';
      console.log(`${triggerReason} ${position.symbol}: ${pnlPercent.toFixed(3)}%`);
      
      let actualExitPrice = currentPrice;
      let actualPnl = pnl;
      let didDirectConversion = false;
      let conversionTarget = '';
      
      // Apply same exit/rotation rules in both paper and live
      // For ROTATION: sell winning position and rotate into rising asset
      if (hitRotationTarget && !hitHardTakeProfit) {
        const targetSymbols = ['BTC', 'ETH', 'SOL', 'XRP', 'AVAX', 'LINK', 'DOT', 'ATOM', 'NEAR', 'APT', 'SUI', 'INJ'];
        const priceChanges = await fetchPriceChanges(targetSymbols);

        const validTargets: Array<{ symbol: string; change24h: number; price: number }> = [];
        for (const targetSymbol of targetSymbols) {
          if (targetSymbol === position.symbol) continue;

          // In live mode, require a tradable pair on Coinbase. In paper, any symbol with price data is valid.
          const pairId = `${position.symbol}-${targetSymbol}`;
          const pairOk = isPaperMode ? true : availablePairs.has(pairId);
          if (!pairOk) continue;

          const data = priceChanges[targetSymbol];
          if (data) {
            validTargets.push({
              symbol: targetSymbol,
              change24h: data.change24h,
              price: data.price,
            });
          }
        }

        validTargets.sort((a, b) => b.change24h - a.change24h);

        if (validTargets.length > 0) {
          const bestTarget = validTargets[0];

          if (bestTarget.change24h >= MIN_TARGET_MOMENTUM && bestTarget.change24h <= MAX_TARGET_MOMENTUM) {
            console.log(`🚀 ${isPaperMode ? '[PAPER] ' : ''}Strong momentum target: ${bestTarget.symbol} (+${bestTarget.change24h.toFixed(2)}% 24h) - CONVERTING`);

            let receivedQuantity: number | undefined;
            if (isPaperMode) {
              // Simulate swap: USD value of position converts at bestTarget.price
              if (bestTarget.price > 0) {
                receivedQuantity = positionValue / bestTarget.price;
                didDirectConversion = true;
              }
            } else {
              const swapResult = await executeCryptoToCryptoSwap(position.symbol, bestTarget.symbol, quantity);
              if (swapResult.success) {
                receivedQuantity = swapResult.receivedQuantity;
                didDirectConversion = true;
              }
            }

            if (didDirectConversion && receivedQuantity && bestTarget.price > 0) {
              console.log(`✅ ${isPaperMode ? '[PAPER] ' : ''}Converted to momentum winner: ${position.symbol} → ${receivedQuantity} ${bestTarget.symbol}`);
              conversionTarget = `${bestTarget.symbol} (+${bestTarget.change24h.toFixed(1)}%)`;
              conversions++;

              await supabase.from('positions').insert({
                user_id: userId,
                symbol: bestTarget.symbol,
                side: 'buy',
                quantity: receivedQuantity,
                avg_entry_price: bestTarget.price,
                current_price: bestTarget.price,
                market_type: 'crypto',
                is_paper: isPaperMode,
                unrealized_pnl: 0,
              });

              // Record the swap's BUY leg in the trade journal so swaps are fully tracked
              await supabase.from('trades').insert({
                user_id: userId,
                symbol: bestTarget.symbol,
                side: 'buy',
                quantity: receivedQuantity,
                entry_price: bestTarget.price,
                status: 'open',
                market_type: 'crypto',
                strategy: 'swap',
                is_paper: isPaperMode,
                ai_reasoning: `🔄 Swap from ${position.symbol} → ${bestTarget.symbol} (+${bestTarget.change24h.toFixed(2)}% 24h momentum)`,
                entry_reasoning: `Direct swap rotation from ${position.symbol}`,
              });
              console.log(`📊 New ${isPaperMode ? 'paper ' : ''}position: ${receivedQuantity} ${bestTarget.symbol}`);
            }
          } else {
            console.log(`📉 Best target ${bestTarget.symbol} momentum ${bestTarget.change24h.toFixed(2)}% outside range (${MIN_TARGET_MOMENTUM}%-${MAX_TARGET_MOMENTUM}%) - selling to cash`);
          }
        }
      }

      // Fall back to cash sell if no direct conversion (or for stop-loss)
      if (!didDirectConversion && !isPaperMode) {
        const isStock = position.market_type === 'stocks';
        console.log(`💰 Selling to cash: ${quantity} ${position.symbol} (${isStock ? 'stock' : 'crypto'})`);

        let sellResult: { success: boolean; usdValue?: number; error?: string };
        if (isStock) {
          sellResult = await executeAlpacaSell(position.symbol, quantity, userId, supabase);
          if (!sellResult.success) {
            sellResult = await executeTradierSell(position.symbol, quantity, userId, supabase);
          }
        } else {
          sellResult = await executeCoinbaseSell(position.symbol, quantity);
        }

        if (sellResult.success) {
          const soldValue = sellResult.usdValue || positionValue;
          actualExitPrice = soldValue / quantity;
          actualPnl = soldValue - (entryPrice * quantity);
          console.log(`✅ Sold to cash: ${position.symbol} -> $${soldValue.toFixed(2)}`);
        } else {
          console.error(`❌ Sell failed for ${position.symbol}: ${sellResult.error}`);
        }
      }


      await supabase.from('trades').update({
        status: 'closed',
        exit_price: actualExitPrice,
        pnl: actualPnl,
        closed_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('symbol', position.symbol).eq('is_paper', isPaperMode).eq('status', 'open');

      await supabase.from('positions').delete().eq('id', position.id);

      // Only credit paper cash when we actually sold to cash (not on rotation, since capital is now in the new position)
      if (isPaperMode && !didDirectConversion) {
        const { data: paperAccount } = await supabase.from('paper_account').select('balance').eq('user_id', userId).single();
        if (paperAccount) {
          const originalInvestment = entryPrice * quantity;
          await supabase.from('paper_account').update({
            balance: Number(paperAccount.balance) + originalInvestment + actualPnl,
            updated_at: new Date().toISOString()
          }).eq('user_id', userId);
        }
      }


      const conversionNote = didDirectConversion ? ` → converted to ${conversionTarget}` : '';
      const decisionType = hitHardTakeProfit ? 'hard_tp' : hitRotationTarget ? 'rotation' : hitTrailingStop ? 'trailing_stop' : 'auto_stop_loss';
      const reasoningText = hitHardTakeProfit
        ? `💰 Hard take-profit at ${pnlPercent.toFixed(3)}% (≥ ${cfgTakeProfitPct}%)`
        : hitRotationTarget 
        ? `🔄 Rotation at ${pnlPercent.toFixed(3)}%` 
        : hitTrailingStop 
          ? `📉 Trailing stop: peak was ${newPeakPnl.toFixed(2)}%, dropped ${dropFromPeak.toFixed(2)}% to ${pnlPercent.toFixed(2)}%`
          : `🛑 Stop loss at ${pnlPercent.toFixed(3)}%`;
      
      await supabase.from('ai_decisions').insert({
        user_id: userId,
        decision_type: decisionType,
        symbol: position.symbol,
        action: didDirectConversion ? 'rotate' : 'sell',
        reasoning: `${reasoningText}${conversionNote}`,
      });

      if (hitHardTakeProfit || hitRotationTarget || hitTrailingStop) takeProfitCount++;
      else stopLossCount++;
    } else {
      // Update position with current price AND peak PnL for trailing stop tracking
      await supabase.from('positions').update({
        current_price: currentPrice,
        unrealized_pnl: pnl,
        peak_pnl_percent: newPeakPnl, // Track new peak for trailing stop
        updated_at: new Date().toISOString(),
      }).eq('id', position.id);
    }
  }

  return { takeProfitCount, stopLossCount, conversions };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for action parameter
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const positionId = url.searchParams.get('position_id');

    // WITHDRAW TO TARGET - Sell holdings until wallet reaches target amount
    if (action === 'withdraw-to-target') {
      const targetBalance = parseFloat(url.searchParams.get('target') || '100');
      console.log(`🎯 WITHDRAW TO TARGET: Selling until wallet has $${targetBalance}`);
      
      // Get current USDC balance from Coinbase
      const holdings = await fetchCoinbaseHoldings();
      
      // Get current balance from API
      const apiKey = Deno.env.get('COINBASE_API_KEY');
      const apiSecret = Deno.env.get('COINBASE_API_SECRET');
      
      let currentBalance = 0;
      if (apiKey && apiSecret) {
        try {
          const uri = `GET api.coinbase.com/api/v3/brokerage/accounts`;
          const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
          
          const response = await fetch('https://api.coinbase.com/api/v3/brokerage/accounts', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${jwt}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            for (const account of data.accounts || []) {
              if (account.currency === 'USDC' || account.currency === 'USD') {
                currentBalance += parseFloat(account.available_balance?.value || '0');
              }
            }
          }
        } catch (e) {
          console.error('Error getting balance:', e);
        }
      }
      
      console.log(`💵 Current USDC balance: $${currentBalance.toFixed(2)}, Target: $${targetBalance}`);
      
      if (currentBalance >= targetBalance) {
        return new Response(JSON.stringify({
          status: 'success',
          action: 'withdraw-to-target',
          message: `Already at target! Current balance: $${currentBalance.toFixed(2)}`,
          currentBalance,
          targetBalance,
          sold: [],
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const amountNeeded = targetBalance - currentBalance;
      console.log(`📊 Need to sell $${amountNeeded.toFixed(2)} worth of crypto`);
      
      // Fetch live prices for holdings
      const symbols = holdings.map(h => h.symbol);
      const livePrices = await fetchLivePrices(symbols);
      
      // Calculate holding values and sort by value (sell largest first)
      const holdingsWithValue = holdings.map(h => ({
        ...h,
        price: livePrices[h.symbol.toUpperCase()] || 0,
        value: (livePrices[h.symbol.toUpperCase()] || 0) * h.quantity,
      })).filter(h => h.value > 0).sort((a, b) => b.value - a.value);
      
      console.log(`📊 Holdings with values:`, holdingsWithValue.map(h => `${h.symbol}: $${h.value.toFixed(2)}`));
      
      const sold: Array<{ symbol: string; quantity: number; usdValue: number }> = [];
      const errors: string[] = [];
      let totalSoldValue = 0;
      
      for (const holding of holdingsWithValue) {
        if (totalSoldValue >= amountNeeded) {
          console.log(`✅ Reached target, stopping sells`);
          break;
        }
        
        const remainingNeeded = amountNeeded - totalSoldValue;
        let quantityToSell = holding.quantity;
        
        // If we only need part of this holding, calculate how much
        if (holding.value > remainingNeeded) {
          quantityToSell = remainingNeeded / holding.price;
          console.log(`📐 Partial sell: ${quantityToSell.toFixed(6)} of ${holding.quantity} ${holding.symbol}`);
        }
        
        console.log(`💰 Selling ${quantityToSell.toFixed(6)} ${holding.symbol} (value: ~$${(quantityToSell * holding.price).toFixed(2)})`);
        
        const result = await executeCoinbaseSell(holding.symbol, quantityToSell);
        
        if (result.success && result.usdValue) {
          sold.push({
            symbol: holding.symbol,
            quantity: quantityToSell,
            usdValue: result.usdValue,
          });
          totalSoldValue += result.usdValue;
          console.log(`✅ Sold ${holding.symbol} for $${result.usdValue.toFixed(2)}, total: $${totalSoldValue.toFixed(2)}`);
        } else {
          errors.push(`${holding.symbol}: ${result.error}`);
          console.error(`❌ Failed to sell ${holding.symbol}: ${result.error}`);
        }
      }
      
      return new Response(JSON.stringify({
        status: 'success',
        action: 'withdraw-to-target',
        startingBalance: currentBalance,
        targetBalance,
        amountNeeded,
        totalSold: totalSoldValue,
        estimatedFinalBalance: currentBalance + totalSoldValue,
        sold,
        errors,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SELL ALL - Liquidate ALL Coinbase crypto holdings to USDC (including dust)
    if (action === 'sell-all') {
      console.log('🔴 SELL ALL COINBASE HOLDINGS requested (including dust)');
      
      // Get all holdings directly from Coinbase (not positions table)
      const holdings = await fetchCoinbaseHoldings();
      const sold: Array<{ symbol: string; quantity: number; usdValue: number }> = [];
      const errors: string[] = [];
      const cleaned: string[] = [];
      
      console.log(`📊 Found ${holdings.length} crypto holdings on Coinbase to liquidate`);
      
      for (const holding of holdings) {
        console.log(`💰 Attempting to sell ${holding.quantity} ${holding.symbol}...`);
        
        // Try aggressive sell with full quantity
        const result = await executeCoinbaseSellAggressive(holding.symbol, holding.quantity);
        
        if (result.success) {
          sold.push({
            symbol: holding.symbol,
            quantity: holding.quantity,
            usdValue: result.usdValue || 0,
          });
          console.log(`✅ Sold ${holding.symbol} for $${result.usdValue?.toFixed(2)}`);
        } else {
          errors.push(`${holding.symbol}: ${result.error}`);
          console.error(`❌ Failed to sell ${holding.symbol}: ${result.error}`);
        }
      }
      
      // Now clean up positions table - delete all live positions
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            while (payload.length % 4) payload += '=';
            const decoded = JSON.parse(atob(payload));
            if (decoded.sub) {
              const userId = decoded.sub;
              
              // Delete all live positions from database
              const { data: deletedPositions, error: delErr } = await supabase
                .from('positions')
                .delete()
                .eq('user_id', userId)
                .eq('is_paper', false)
                .select('symbol');
              
              if (!delErr && deletedPositions) {
                cleaned.push(...deletedPositions.map((p: any) => p.symbol));
                console.log(`🧹 Cleaned up ${deletedPositions.length} positions from database`);
              }
              
              // Log the mass liquidation
              const totalSold = sold.reduce((sum, s) => sum + s.usdValue, 0);
              await supabase.from('ai_decisions').insert({
                user_id: userId,
                decision_type: 'mass_liquidation',
                action: 'sell',
                reasoning: `Sold ALL ${sold.length} holdings for $${totalSold.toFixed(2)} USDC. Cleaned ${cleaned.length} positions. Errors: ${errors.length}`,
              });
            }
          }
        } catch (e) {
          console.error('Failed to clean positions:', e);
        }
      }
      
      const totalSold = sold.reduce((sum, s) => sum + s.usdValue, 0);
      
      return new Response(JSON.stringify({
        status: 'success',
        action: 'sell-all',
        holdingsSold: sold.length,
        totalUsdValue: totalSold,
        sold,
        errors,
        positionsCleaned: cleaned,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'force-sell' && positionId) {
      console.log(`🔴 FORCE SELL requested for position: ${positionId}`);
      
      // Get the position
      const { data: position, error: posErr } = await supabase
        .from('positions')
        .select('*')
        .eq('id', positionId)
        .single();

      if (posErr || !position) {
        return new Response(JSON.stringify({ error: 'Position not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`📊 Force selling: ${position.quantity} ${position.symbol}`);

      // Execute REAL Coinbase sell if live mode
      let sellSuccess = false;
      let sellUsdValue = 0;
      let sellError = '';
      if (!position.is_paper) {
        console.log(`💰 EXECUTING REAL COINBASE SELL: ${position.quantity} ${position.symbol}`);
        const sellResult = await executeCoinbaseSell(position.symbol, position.quantity);
        sellSuccess = sellResult.success;
        sellUsdValue = sellResult.usdValue || 0;
        sellError = sellResult.error || '';
        console.log(`📤 Coinbase sell result:`, sellResult);
      }

      // Calculate PnL
      const currentPrice = position.current_price || position.avg_entry_price;
      const pnl = (currentPrice - position.avg_entry_price) * position.quantity;

      // Create closed trade record
      await supabase.from('trades').insert({
        user_id: position.user_id,
        symbol: position.symbol,
        side: position.side,
        quantity: position.quantity,
        entry_price: position.avg_entry_price,
        exit_price: currentPrice,
        pnl: pnl,
        status: 'closed',
        is_paper: position.is_paper,
        market_type: position.market_type,
        strategy: position.strategy,
        closed_at: new Date().toISOString(),
        ai_reasoning: `Force closed by user. ${sellSuccess ? `Coinbase sell: $${sellUsdValue.toFixed(2)}` : sellError || 'Simulated'}`,
      });

      // Update balance if paper mode
      if (position.is_paper) {
        const positionValue = currentPrice * position.quantity;
        const { data: paperData } = await supabase
          .from('paper_account')
          .select('balance')
          .eq('user_id', position.user_id)
          .single();
        
        if (paperData) {
          await supabase.from('paper_account')
            .update({ balance: paperData.balance + positionValue })
            .eq('user_id', position.user_id);
        }
      }

      // Delete the position
      await supabase.from('positions').delete().eq('id', positionId);

      // Log the decision
      await supabase.from('ai_decisions').insert({
        user_id: position.user_id,
        decision_type: 'force_close',
        symbol: position.symbol,
        action: 'sell',
        reasoning: `Force closed by user. PnL: $${pnl.toFixed(2)}. ${sellSuccess ? `Coinbase: $${sellUsdValue.toFixed(2)} USDC` : 'Simulated'}`,
      });

      return new Response(JSON.stringify({
        status: 'success',
        action: 'force-sell',
        symbol: position.symbol,
        quantity: position.quantity,
        pnl: pnl,
        coinbaseSell: { success: sellSuccess, usdValue: sellUsdValue, error: sellError },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    // If no specific user, process ALL users with AI enabled OR with open positions
    // (so we can auto-restart bots that were stopped by kill-switch / disable).
    if (userIds.length === 0) {
      console.log('🔄 Cron job: Processing all users with AI enabled or open positions');
      const ids = new Set<string>();

      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('user_id')
        .or('enabled.eq.true,kill_switch_active.eq.true');
      aiSettings?.forEach((s: any) => ids.add(s.user_id));

      const { data: openPos } = await supabase
        .from('positions')
        .select('user_id');
      openPos?.forEach((p: any) => ids.add(p.user_id));

      userIds = Array.from(ids);
    }

    console.log(`Processing ${userIds.length} user(s)`);

    // Fetch available trading pairs once for all users
    const availablePairs = await fetchAvailablePairs();

    let totalTakeProfit = 0;
    let totalStopLoss = 0;
    let totalConversions = 0;

    let autoRestarts = 0;

    for (const userId of userIds) {
      // Get user's trading mode + current bot state (needed for auto-restart check)
      const { data: settings } = await supabase
        .from('ai_settings')
        .select('trading_mode, enabled, kill_switch_active, bot_status')
        .eq('user_id', userId)
        .single();

      const isPaperMode = settings?.trading_mode === 'paper';
      const result = await processUserPositions(supabase, userId, isPaperMode, availablePairs);
      totalTakeProfit += result.takeProfitCount;
      totalStopLoss += result.stopLossCount;
      totalConversions += result.conversions || 0;

      // 🔁 AUTO-RESTART: if the bot is currently stopped (kill-switch or disabled)
      // and all positions for this mode are now closed, bring it back online so
      // the next trading-engine cycle resumes scanning. Runs every cycle (not
      // only when we just closed something) so a bot that was disabled while
      // already flat still gets re-armed.
      const stopped = settings?.kill_switch_active === true || settings?.enabled === false;
      if (stopped) {
        const { count: openCount } = await supabase
          .from('positions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('is_paper', isPaperMode);

        if ((openCount ?? 0) === 0) {
          await supabase.from('ai_settings').update({
            enabled: true,
            kill_switch_active: false,
            kill_switch_triggered_at: null,
            bot_status: 'idle',
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId);

          await supabase.from('risk_events').insert({
            user_id: userId,
            event_type: 'bot_auto_restart',
            severity: 'info',
            message: 'Bot auto-restarted (flat + stopped)',
            details: {
              trigger: settings?.kill_switch_active ? 'kill_switch_cleared' : 'bot_re_enabled',
              mode: isPaperMode ? 'paper' : 'live',
            },
          });

          autoRestarts += 1;
          console.log(`🔁 Auto-restart: bot re-enabled for user ${userId} (all ${isPaperMode ? 'paper' : 'live'} positions closed)`);
        }
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      usersProcessed: userIds.length,
      rotationThreshold: `+${getAdjustedRotationThreshold().toFixed(3)}%`,
      stopLossLimit: `${getAdjustedStopLoss().toFixed(3)}%`,
      latencyMetrics: {
        avgMs: latencyTracker.avgLatencyMs.toFixed(0),
        maxMs: latencyTracker.maxLatencyMs.toFixed(0),
        slippageBuffer: `${(latencyTracker.slippageBuffer * 100).toFixed(3)}%`,
      },
      totalTakeProfitClosed: totalTakeProfit,
      totalStopLossClosed: totalStopLoss,
      totalDirectConversions: totalConversions,
      autoRestarts,
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

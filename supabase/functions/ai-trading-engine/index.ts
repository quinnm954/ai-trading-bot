import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// DUPLICATE TRADE PREVENTION - Stops rapid re-entry on same symbol
// =============================================================================

type TradeSide = 'buy' | 'sell';

const DUPLICATE_TRADE_COOLDOWN_MINUTES = 90; // prevents stacking the same trade every minute

function tradeKey(symbol: string, side: TradeSide) {
  return `${symbol.toUpperCase()}:${side}`;
}

async function getRecentTradeKeys(
  supabase: any,
  userId: string,
  isPaperMode: boolean,
  cooldownMinutes: number
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const cutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();

  const { data: trades, error } = await supabase
    .from('trades')
    .select('symbol, side, created_at')
    .eq('user_id', userId)
    .eq('is_paper', isPaperMode)
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(250);

  if (error) {
    console.log('⚠️ Duplicate guard: failed to fetch recent trades:', error.message || error);
    return map;
  }

  for (const t of trades || []) {
    const key = tradeKey(t.symbol, t.side as TradeSide);
    // trades are ordered desc; first time we see key is most recent
    if (!map.has(key) && t.created_at) {
      map.set(key, new Date(t.created_at).getTime());
    }
  }

  return map;
}

async function getOpenPositionSymbols(
  supabase: any,
  userId: string,
  isPaperMode: boolean
): Promise<Set<string>> {
  const set = new Set<string>();

  const { data: positions, error } = await supabase
    .from('positions')
    .select('symbol')
    .eq('user_id', userId)
    .eq('is_paper', isPaperMode);

  if (error) {
    console.log('⚠️ Duplicate guard: failed to fetch positions:', error.message || error);
    return set;
  }

  for (const p of positions || []) {
    if (p.symbol) set.add(String(p.symbol).toUpperCase());
  }

  return set;
}

// =============================================================================
// LOSS PREVENTION SYSTEM - Prevents repeated losing trades on same asset
// =============================================================================

interface RecentLoss {
  symbol: string;
  lossCount: number;
  lastLossAt: Date;
  totalLossPercent: number;
}

/**
 * Fetches recent losing trades for a symbol to prevent repeated losses
 * Returns symbols that should be avoided (cooldown period)
 */
/**
 * Fetches recent losing trades for a symbol to prevent repeated losses
 * IMPORTANT: Checks BOTH paper and live trades to learn from all losses
 * This prevents repeating the same mistakes when switching modes
 */
async function getRecentLosingSymbols(
  supabase: any,
  userId: string,
  _isPaperMode: boolean, // Kept for API compatibility but not used - we check ALL modes
  cooldownHours: number = 6, // Don't trade same symbol for X hours after loss
  maxConsecutiveLosses: number = 2 // Max losses before longer cooldown
): Promise<Map<string, RecentLoss>> {
  const lossCooldownMap = new Map<string, RecentLoss>();
  
  try {
    // Get recent closed trades with losses in the last 24 hours
    // CRITICAL: Check ALL trades regardless of paper/live mode
    // This prevents repeating losing trades when switching modes
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: recentTrades } = await supabase
      .from('trades')
      .select('symbol, pnl, closed_at, entry_price, exit_price, is_paper')
      .eq('user_id', userId)
      // REMOVED: .eq('is_paper', isPaperMode) - now checks ALL modes
      .eq('status', 'closed')
      .lt('pnl', 0) // Only losses
      .gte('closed_at', cutoffTime)
      .order('closed_at', { ascending: false });
    
    if (!recentTrades || recentTrades.length === 0) {
      console.log('✅ No recent losses in any mode - all symbols available');
      return lossCooldownMap;
    }
    
    // Group losses by symbol (across both modes)
    for (const trade of recentTrades) {
      const existing = lossCooldownMap.get(trade.symbol);
      const lossPercent = trade.entry_price > 0 
        ? ((trade.exit_price - trade.entry_price) / trade.entry_price) * 100 
        : 0;
      
      if (existing) {
        existing.lossCount += 1;
        existing.totalLossPercent += Math.abs(lossPercent);
      } else {
        lossCooldownMap.set(trade.symbol, {
          symbol: trade.symbol,
          lossCount: 1,
          lastLossAt: new Date(trade.closed_at),
          totalLossPercent: Math.abs(lossPercent),
        });
      }
    }
    
    // Log which symbols are on cooldown
    if (lossCooldownMap.size > 0) {
      console.log(`⏸️ LOSS COOLDOWN - Recent losing symbols (across all modes):`);
      lossCooldownMap.forEach((loss, symbol) => {
        const hoursSinceLoss = (Date.now() - loss.lastLossAt.getTime()) / (1000 * 60 * 60);
        const isOnCooldown = hoursSinceLoss < cooldownHours || loss.lossCount >= maxConsecutiveLosses;
        console.log(`   ${symbol}: ${loss.lossCount} loss(es), -${loss.totalLossPercent.toFixed(2)}%, ${hoursSinceLoss.toFixed(1)}h ago ${isOnCooldown ? '🚫 BLOCKED' : '✅ OK'}`);
      });
    }
    
    return lossCooldownMap;
  } catch (error) {
    console.error('Error fetching recent losses:', error);
    return lossCooldownMap;
  }
}

/**
 * Check if a symbol should be blocked due to recent losses
 */
function shouldBlockSymbolDueToLosses(
  symbol: string,
  lossCooldownMap: Map<string, RecentLoss>,
  cooldownHours: number = 6,
  maxConsecutiveLosses: number = 2
): { blocked: boolean; reason: string } {
  const lossData = lossCooldownMap.get(symbol);
  
  if (!lossData) {
    return { blocked: false, reason: '' };
  }
  
  const hoursSinceLoss = (Date.now() - lossData.lastLossAt.getTime()) / (1000 * 60 * 60);
  
  // Block if too many consecutive losses (extended cooldown)
  if (lossData.lossCount >= maxConsecutiveLosses) {
    const extendedCooldown = cooldownHours * lossData.lossCount; // Scale cooldown with losses
    if (hoursSinceLoss < extendedCooldown) {
      return {
        blocked: true,
        reason: `🛑 BLOCKED: ${symbol} has ${lossData.lossCount} consecutive losses (-${lossData.totalLossPercent.toFixed(1)}%). Cooldown: ${(extendedCooldown - hoursSinceLoss).toFixed(1)}h remaining`,
      };
    }
  }
  
  // Block if within standard cooldown period
  if (hoursSinceLoss < cooldownHours) {
    return {
      blocked: true,
      reason: `⏸️ COOLDOWN: ${symbol} lost money ${hoursSinceLoss.toFixed(1)}h ago. Wait ${(cooldownHours - hoursSinceLoss).toFixed(1)}h`,
    };
  }
  
  return { blocked: false, reason: '' };
}

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
  openPositionsValue: number,
  openPositionsUnrealizedPnl: number = 0
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
        openPositionsUnrealizedPnl,
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

// =============================================================================
// STOCK BROKER INTEGRATIONS - Multi-Asset Trading Support
// PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
// =============================================================================

interface StockBrokerBalance {
  cash: number;
  buyingPower: number;
  equity: number;
  broker: 'alpaca' | 'ibkr' | 'tradier';
}

interface StockTradeResult {
  success: boolean;
  orderId?: string;
  quantity?: number;
  price?: number;
  error?: string;
}

/**
 * Check if US stock market is currently open
 * Stock trading is only available during market hours
 */
function isStockMarketOpen(): boolean {
  const now = new Date();
  const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = nyTime.getDay();
  const hour = nyTime.getHours();
  const minute = nyTime.getMinutes();
  const time = hour * 100 + minute;
  
  // Monday-Friday, 9:30 AM - 4:00 PM ET
  if (day === 0 || day === 6) return false; // Weekend
  if (time < 930 || time >= 1600) return false; // Outside hours
  
  return true;
}

/**
 * Get user's connected stock broker credentials from broker_credentials table
 */
async function getConnectedStockBroker(supabase: any, userId: string): Promise<{ 
  broker: 'alpaca' | 'ibkr' | 'tradier'; 
  apiKey: string; 
  secretKey: string;
  accessToken?: string;
  isPaper: boolean;
} | null> {
  try {
    // Query broker_credentials table for connected stock brokers
    const { data: credentials, error } = await supabase
      .from('broker_credentials')
      .select('provider, api_key_encrypted, secret_key_encrypted, access_token_encrypted, is_paper')
      .eq('user_id', userId)
      .in('provider', ['alpaca', 'ibkr', 'tradier']);
    
    if (error || !credentials || credentials.length === 0) {
      console.log('No stock broker credentials found in database');
      return null;
    }
    
    // Return first available broker with valid credentials
    for (const cred of credentials) {
      if (cred.api_key_encrypted) {
        console.log(`🏦 Found ${cred.provider} credentials for user`);
        return {
          broker: cred.provider as 'alpaca' | 'ibkr' | 'tradier',
          apiKey: cred.api_key_encrypted,
          secretKey: cred.secret_key_encrypted || '',
          accessToken: cred.access_token_encrypted,
          isPaper: cred.is_paper,
        };
      }
    }
    
    return null;
  } catch (err) {
    console.error('Error fetching broker credentials:', err);
    return null;
  }
}

/**
 * Execute stock trade via Alpaca
 * Supports both paper and live trading
 */
async function executeAlpacaTrade(
  apiKey: string,
  secretKey: string,
  symbol: string,
  side: 'buy' | 'sell',
  quantity: number,
  isPaper: boolean = true
): Promise<StockTradeResult> {
  try {
    const baseUrl = isPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    
    console.log(`📈 Alpaca ${isPaper ? 'PAPER' : 'LIVE'} ${side.toUpperCase()}: ${quantity} ${symbol}`);
    
    const orderBody = {
      symbol: symbol,
      qty: quantity.toString(),
      side: side,
      type: 'market',
      time_in_force: 'day',
    };
    
    const response = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Alpaca order failed: ${errorText}`);
      return { success: false, error: errorText };
    }
    
    const order = await response.json();
    console.log(`✅ Alpaca order placed: ${order.id}`);
    
    return {
      success: true,
      orderId: order.id,
      quantity: parseFloat(order.qty),
      price: parseFloat(order.filled_avg_price || order.limit_price || '0'),
    };
  } catch (error) {
    console.error('Alpaca trade error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Execute stock trade via Interactive Brokers
 * Uses IBKR Client Portal API
 */
async function executeIBKRTrade(
  accessToken: string,
  symbol: string,
  side: 'buy' | 'sell',
  quantity: number
): Promise<StockTradeResult> {
  try {
    console.log(`📈 IBKR ${side.toUpperCase()}: ${quantity} ${symbol}`);
    
    // IBKR requires account ID first
    const accountsResponse = await fetch('https://api.ibkr.com/v1/api/portfolio/accounts', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (!accountsResponse.ok) {
      return { success: false, error: 'Failed to get IBKR accounts' };
    }
    
    const accounts = await accountsResponse.json();
    if (!accounts || accounts.length === 0) {
      return { success: false, error: 'No IBKR accounts found' };
    }
    
    const accountId = accounts[0].id || accounts[0].accountId;
    
    // Place order
    const orderBody = {
      orders: [{
        conid: 0, // Will need to lookup conid for symbol
        orderType: 'MKT',
        side: side.toUpperCase(),
        quantity: quantity,
        tif: 'DAY',
      }],
    };
    
    // Get contract ID for symbol
    const searchResponse = await fetch(
      `https://api.ibkr.com/v1/api/iserver/secdef/search?symbol=${symbol}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (searchResponse.ok) {
      const contracts = await searchResponse.json();
      if (contracts && contracts.length > 0) {
        orderBody.orders[0].conid = contracts[0].conid;
      }
    }
    
    const response = await fetch(
      `https://api.ibkr.com/v1/api/iserver/account/${accountId}/orders`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderBody),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: errorText };
    }
    
    const result = await response.json();
    console.log(`✅ IBKR order placed`);
    
    return {
      success: true,
      orderId: result.orderId || result[0]?.id,
      quantity,
    };
  } catch (error) {
    console.error('IBKR trade error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Execute stock trade via Tradier
 * Commission-free stock and options trading
 */
async function executeTradierTrade(
  accessToken: string,
  symbol: string,
  side: 'buy' | 'sell',
  quantity: number,
  useSandbox: boolean = false
): Promise<StockTradeResult> {
  try {
    const baseUrl = useSandbox 
      ? 'https://sandbox.tradier.com'
      : 'https://api.tradier.com';
    
    console.log(`📈 Tradier ${useSandbox ? 'SANDBOX' : 'LIVE'} ${side.toUpperCase()}: ${quantity} ${symbol}`);
    
    // Get account ID first
    const accountsResponse = await fetch(`${baseUrl}/v1/user/profile`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });
    
    if (!accountsResponse.ok) {
      return { success: false, error: 'Failed to get Tradier profile' };
    }
    
    const profile = await accountsResponse.json();
    const accountId = profile?.profile?.account?.account_number;
    
    if (!accountId) {
      return { success: false, error: 'No Tradier account found' };
    }
    
    // Place order using form data (Tradier API format)
    const formData = new URLSearchParams();
    formData.append('class', 'equity');
    formData.append('symbol', symbol);
    formData.append('side', side);
    formData.append('quantity', quantity.toString());
    formData.append('type', 'market');
    formData.append('duration', 'day');
    
    const response = await fetch(
      `${baseUrl}/v1/accounts/${accountId}/orders`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Tradier order failed: ${errorText}`);
      return { success: false, error: errorText };
    }
    
    const result = await response.json();
    console.log(`✅ Tradier order placed: ${result.order?.id}`);
    
    return {
      success: true,
      orderId: result.order?.id?.toString(),
      quantity,
      price: result.order?.price,
    };
  } catch (error) {
    console.error('Tradier trade error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Route stock trade to the appropriate broker
 */
async function executeStockTrade(
  supabase: any,
  userId: string,
  symbol: string,
  side: 'buy' | 'sell',
  quantity: number,
  isPaper: boolean
): Promise<StockTradeResult> {
  const broker = await getConnectedStockBroker(supabase, userId);
  
  if (!broker) {
    console.log('⚠️ No stock broker connected, cannot execute stock trade');
    return { success: false, error: 'No stock broker connected' };
  }
  
  console.log(`🏦 Routing stock trade to: ${broker.broker} (${broker.isPaper ? 'PAPER' : 'LIVE'} mode)`);
  
  switch (broker.broker) {
    case 'alpaca':
      return executeAlpacaTrade(broker.apiKey, broker.secretKey, symbol, side, quantity, broker.isPaper || isPaper);
    case 'ibkr':
      return executeIBKRTrade(broker.accessToken || broker.apiKey, symbol, side, quantity);
    case 'tradier':
      return executeTradierTrade(broker.accessToken || broker.apiKey, symbol, side, quantity, broker.isPaper || isPaper);
    default:
      return { success: false, error: `Unsupported broker: ${broker.broker}` };
  }
}

/**
 * Fetch stock market data for trading analysis
 * Uses Alpaca as primary, Yahoo Finance as fallback
 */
async function fetchStockMarketData(): Promise<MarketData[]> {
  // Check if market is open
  if (!isStockMarketOpen()) {
    console.log('📊 Stock market closed - skipping stock data fetch');
    return [];
  }
  
  // Top stocks for trading (high liquidity, good for scalping)
  const stocks = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'NFLX', 'CRM',
    'SPY', 'QQQ', 'IWM', 'DIA', 'XLF', 'XLE', 'XLK', 'ARKK',
    'PLTR', 'COIN', 'MARA', 'RIOT', 'SOFI', 'NIO', 'LCID', 'RIVN',
    'INTC', 'MU', 'QCOM', 'AVGO', 'ORCL', 'IBM', 'CSCO',
    'JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA',
  ];
  
  try {
    // Try Yahoo Finance API (public, no key needed)
    const stockData: MarketData[] = [];
    
    // Batch requests for efficiency
    const symbolList = stocks.join(',');
    const response = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbolList}`
    );
    
    if (response.ok) {
      const data = await response.json();
      const quotes = data?.quoteResponse?.result || [];
      
      for (const quote of quotes) {
        if (quote.regularMarketPrice) {
          stockData.push({
            symbol: quote.symbol,
            price: quote.regularMarketPrice,
            change24h: quote.regularMarketChangePercent || 0,
            change7d: 0, // Yahoo doesn't provide 7d easily
            volume: quote.regularMarketVolume || 0,
            high24h: quote.regularMarketDayHigh || quote.regularMarketPrice,
            low24h: quote.regularMarketDayLow || quote.regularMarketPrice,
          });
        }
      }
      
      console.log(`📈 Fetched ${stockData.length} stocks from Yahoo Finance`);
      return stockData;
    }
  } catch (error) {
    console.error('Error fetching stock data:', error);
  }
  
  return [];
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
  const high24h = coin.high24h ?? coin.price ?? 0;
  const low24h = coin.low24h ?? coin.price ?? 0;
  const price = coin.price ?? 0;
  const priceRange = high24h - low24h;
  const pricePosition = priceRange > 0 ? (price - low24h) / priceRange : 0.5;
  
  // Null-safe access to change values
  const change24h = coin.change24h ?? 0;
  const change7d = coin.change7d ?? 0;
  
  // Calculate trend strength based on multiple factors + MTF
  let trendScore = 0;
  
  // Factor 1: 24h price change (weight: 30%)
  const changeScore = Math.max(-1, Math.min(1, change24h / 10));
  trendScore += changeScore * 0.3;
  
  // Factor 2: Price position in daily range (weight: 20%)
  const positionScore = (pricePosition - 0.5) * 2;
  trendScore += positionScore * 0.2;
  
  // Factor 3: Momentum alignment (weight: 20%)
  const momentumAlignment = change24h > 0 && pricePosition > 0.5 ? 1 :
                            change24h < 0 && pricePosition < 0.5 ? -1 : 0;
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
    reason = `🚀 Strong uptrend: +${change24h.toFixed(1)}% | ${mtf.reasoning}`;
  } else if (trendScore >= 0.1) {
    trend = 'uptrend';
    shouldTrade = true; // Trade uptrends too
    reason = `📈 Uptrend: +${change24h.toFixed(1)}% | ${mtf.reasoning}`;
  } else if (trendScore <= -0.7) {
    trend = 'strong_downtrend';
    shouldTrade = false;
    // Analyze for potential reversal entry timing
    const reversalPotential = mtf.entryScore > 60 ? 'HIGH' : mtf.entryScore > 40 ? 'MEDIUM' : 'LOW';
    const watchSignal = pricePosition < 0.2 ? '👀 Near support - watching for bounce' : '⏳ Waiting for capitulation';
    reason = `⚠️ Strong downtrend: ${change24h.toFixed(1)}% - WATCHING | Reversal potential: ${reversalPotential} | ${watchSignal}`;
  } else if (trendScore <= -0.3) {
    trend = 'downtrend';
    shouldTrade = false;
    reason = `📉 Downtrend: ${change24h.toFixed(1)}% - AVOIDING`;
  } else {
    trend = 'neutral';
    shouldTrade = false; // Skip neutral markets
    reason = `➡️ Neutral (skipping): ${change24h.toFixed(1)}% | ${mtf.reasoning}`;
  }
  
  return {
    symbol: coin.symbol,
    trend,
    trendStrength: trendScore,
    shouldTrade,
    reason,
  };
}

// Stablecoins to exclude from trading
const STABLECOINS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'USDP', 'GUSD', 'USD', 'PYUSD', 'USD1', 'FDUSD', 'FRAX'];

// Minimum price filter - exclude coins worth less than $1
const MIN_PRICE_USD = 1.0;

// =============================================================================
// PARABOLIC MOVE FILTER - Prevents buying assets that have already pumped
// Key fix: Old system bought "+9% 24h" thinking it was "strong uptrend" but
// that means buying at the TOP. This filter ensures we only buy dips, not peaks.
// =============================================================================
const MAX_24H_CHANGE_FOR_ENTRY = 1; // Don't buy if already up more than 1% in 24h
const MIN_24H_CHANGE_FOR_ENTRY = -5; // Don't buy if crashing more than 5%

// DIP-BUYING STRATEGY: Buy pullbacks in uptrending assets (not peaks)
function filterByTrend(marketData: MarketData[]): { tradeable: MarketData[], trendAnalysis: TrendAnalysis[] } {
  // Pre-filter: Remove stablecoins and low-price coins
  const eligibleCoins = marketData.filter(coin => {
    const isStablecoin = STABLECOINS.includes(coin.symbol.toUpperCase());
    const price = coin.price ?? 0;
    const isBelowMinPrice = price < MIN_PRICE_USD;
    
    if (isStablecoin) {
      console.log(`🚫 Excluding stablecoin: ${coin.symbol}`);
      return false;
    }
    if (isBelowMinPrice) {
      console.log(`🚫 Excluding low-price coin: ${coin.symbol} @ $${price.toFixed(4)}`);
      return false;
    }
    return true;
  });
  
  console.log(`✅ Eligible coins (>= $${MIN_PRICE_USD}, non-stablecoin): ${eligibleCoins.length}/${marketData.length}`);
  
  // Step 1: Find DIP-BUY candidates - assets that:
  // - Have positive 7-day trend (overall uptrend)
  // - 24h change is between -5% and +1% (BUYING DIPS, NOT PUMPS)
  // - This prevents the old mistake of buying "+9% 24h" assets at their peak
  const dipBuyCandidates = eligibleCoins.filter(coin => {
    const change24h = coin.change24h ?? 0;
    const change7d = coin.change7d ?? 0;
    const has7dUptrend = change7d > 2; // Asset is up >2% over 7 days (uptrend)
    const hasDip = change24h <= MAX_24H_CHANGE_FOR_ENTRY && change24h >= MIN_24H_CHANGE_FOR_ENTRY;
    
    // Log parabolic rejections for visibility
    if (change24h > MAX_24H_CHANGE_FOR_ENTRY) {
      console.log(`🚫 PARABOLIC SKIP: ${coin.symbol} already +${change24h.toFixed(1)}% today - NOT buying at peak`);
      return false;
    }
    if (change24h < MIN_24H_CHANGE_FOR_ENTRY) {
      console.log(`🚫 CRASH SKIP: ${coin.symbol} down ${change24h.toFixed(1)}% - avoiding falling knife`);
      return false;
    }
    
    return has7dUptrend && hasDip;
  });
  
  // REMOVED momentum plays that allowed buying pumped assets
  // Old code allowed buying if change24h > 3% which caused the losses
  // Now we ONLY buy dips in uptrending assets
  
  console.log(`🎯 DIP-BUY FILTER: ${dipBuyCandidates.length} dip candidates (24h change ${MIN_24H_CHANGE_FOR_ENTRY}% to +${MAX_24H_CHANGE_FOR_ENTRY}% only)`);
  
  // Step 2: Analyze trends for candidates (now only dip candidates, no parabolic plays)
  const trendAnalysis: TrendAnalysis[] = dipBuyCandidates.map((coin: MarketData) => {
    const analysis = analyzeTrend(coin);
    const change24h = coin.change24h ?? 0;
    const change7d = coin.change7d ?? 0;
    // For dip-buying, we want to trade pullbacks in uptrending assets
    const isDipBuy = change7d > 2 && change24h <= MAX_24H_CHANGE_FOR_ENTRY;
    if (isDipBuy && change24h >= MIN_24H_CHANGE_FOR_ENTRY) {
      // Override to allow trading dips in uptrending assets
      return {
        ...analysis,
        shouldTrade: true,
        reason: `🔄 DIP-BUY: 7d: +${change7d.toFixed(1)}% uptrend, 24h: ${change24h.toFixed(1)}% pullback | NOT buying at peak`,
      };
    }
    return analysis;
  });
  
  let tradeable = dipBuyCandidates.filter((coin: MarketData) => {
    const analysis = trendAnalysis.find((t: TrendAnalysis) => t.symbol === coin.symbol);
    return analysis?.shouldTrade ?? false;
  });

  // 🩹 STARVATION RELAXATION: When the dip pool is too small, allow mild-momentum entries
  // (+1% to +4% 24h in a 7d uptrend). Prevents the bot from being forced to either no-trade
  // or pick the single bad setup left over. Sizing should be halved by the caller for these.
  if (tradeable.length < 3) {
    const mildMomentum = eligibleCoins.filter(coin => {
      const c24 = coin.change24h ?? 0;
      const c7 = coin.change7d ?? 0;
      return c7 > 2 && c24 > MAX_24H_CHANGE_FOR_ENTRY && c24 <= 4
        && !tradeable.find(t => t.symbol === coin.symbol);
    });
    if (mildMomentum.length > 0) {
      console.log(`🩹 STARVATION RELAX: adding ${mildMomentum.length} mild-momentum candidates (+1% to +4% 24h in 7d uptrend)`);
      mildMomentum.forEach(coin => {
        trendAnalysis.push({
          ...analyzeTrend(coin),
          shouldTrade: true,
          reason: `🩹 MILD-MOMENTUM (starvation relax): 7d +${(coin.change7d ?? 0).toFixed(1)}%, 24h +${(coin.change24h ?? 0).toFixed(1)}%`,
        });
      });
      tradeable = tradeable.concat(mildMomentum);
    }
  }

  console.log(`📈 Tradeable (dips + relaxed): ${tradeable.length}`);

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

// AUTONOMOUS AI CONFIG - Risk tolerance drives behavior
const RISK_TOLERANCE_CONFIG = {
  conservative: {
    MIN_CONFIDENCE: 0.70,
    TARGET_PROFIT: 0.5,
    MAX_HOLD_MINUTES: 30,
    TOP_TRADES_PER_CYCLE: 3,
    POSITION_SIZE_MULT: 0.5,
    LEVERAGE_MULT: 0.25,
  },
  moderate: {
    MIN_CONFIDENCE: 0.60,
    TARGET_PROFIT: 1.0,
    MAX_HOLD_MINUTES: 60,
    TOP_TRADES_PER_CYCLE: 8,
    POSITION_SIZE_MULT: 1.0,
    LEVERAGE_MULT: 0.5,
  },
  aggressive: {
    MIN_CONFIDENCE: 0.50,
    TARGET_PROFIT: 1.5,
    MAX_HOLD_MINUTES: 120,
    TOP_TRADES_PER_CYCLE: 12,
    POSITION_SIZE_MULT: 1.5,
    LEVERAGE_MULT: 0.75,
  },
  ultra_aggressive: {
    MIN_CONFIDENCE: 0.45,
    TARGET_PROFIT: 2.0,
    MAX_HOLD_MINUTES: 180,
    TOP_TRADES_PER_CYCLE: 15,
    POSITION_SIZE_MULT: 2.0,
    LEVERAGE_MULT: 1.0,
  },
};

// Calculate optimal leverage based on risk tolerance
function calculateOptimalLeverage(maxLeverage: number, riskTolerance: string): number {
  const config = RISK_TOLERANCE_CONFIG[riskTolerance as keyof typeof RISK_TOLERANCE_CONFIG] || RISK_TOLERANCE_CONFIG.moderate;
  return Math.max(1, Math.floor(maxLeverage * config.LEVERAGE_MULT));
}

// AI decides optimal position size based on risk tolerance and market conditions
function calculateOptimalPositionSize(
  maxPositionSize: number,
  confidence: number, 
  leverage: number,
  trendStrength: number,
  riskTolerance: string
): number {
  const config = RISK_TOLERANCE_CONFIG[riskTolerance as keyof typeof RISK_TOLERANCE_CONFIG] || RISK_TOLERANCE_CONFIG.moderate;
  
  // Base position size scales with confidence and trend strength
  let baseSize = 10 + (confidence * 20) + (Math.max(0, trendStrength) * 15);
  
  // Apply risk tolerance multiplier
  baseSize *= config.POSITION_SIZE_MULT;
  
  // Apply leverage multiplier (notional exposure)
  const leveragedSize = baseSize * leverage;
  
  // Cap at max position size setting
  return Math.min(maxPositionSize, leveragedSize);
}

// AI-powered market analysis - using Lovable AI
async function analyzeWithAI(
  marketData: MarketData[], 
  balance: number, 
  maxPositionSize: number, 
  trendAnalysis: TrendAnalysis[], 
  bestStrategy: string, 
  regime: string,
  leverage: number = 1,
  riskTolerance: string = 'moderate'
): Promise<AITradingDecision[]> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  
  if (!LOVABLE_API_KEY) {
    console.log('No Lovable API key, falling back to rule-based analysis');
    return [];
  }

  const config = RISK_TOLERANCE_CONFIG[riskTolerance as keyof typeof RISK_TOLERANCE_CONFIG] || RISK_TOLERANCE_CONFIG.moderate;

  // Build trend context for AI
  const trendContext = trendAnalysis.map(t => `${t.symbol}: ${t.trend} (${t.reason})`).join('\n');
  
  // Get strategy description
  const strategyDesc = strategyDescriptions[bestStrategy] || strategyDescriptions.custom;

  const prompt = `You are an AI trading system optimized to MAXIMIZE PROFIT and MINIMIZE LOSS.

OBJECTIVE: Identify the best trading opportunities to grow capital while managing risk.
CURRENT BALANCE: $${balance.toFixed(2)}
RISK TOLERANCE: ${riskTolerance.toUpperCase()}

RISK-BASED PARAMETERS:
- Min confidence for trade: ${(config.MIN_CONFIDENCE * 100).toFixed(0)}%
- Target profit per trade: ${config.TARGET_PROFIT}%
- Max trades this cycle: ${config.TOP_TRADES_PER_CYCLE}
- Position sizing multiplier: ${config.POSITION_SIZE_MULT}x

CONSTRAINTS:
- Max position size: ${maxPositionSize}% per trade
- Leverage available: ${leverage}x
- Strategy: ${bestStrategy.toUpperCase()} - ${strategyDesc}
- Market regime: ${regime.toUpperCase()}

TREND ANALYSIS:
${trendContext}

LIVE MARKET DATA:
${marketData.filter(m => m.price != null).map(m => `${m.symbol}: $${(m.price || 0).toFixed(2)} | 24h: ${(m.change24h || 0) > 0 ? '+' : ''}${(m.change24h || 0).toFixed(2)}% | Range: $${(m.low24h || 0).toFixed(2)}-$${(m.high24h || 0).toFixed(2)} | Vol: $${((m.volume || 0)/1e9).toFixed(1)}B`).join('\n')}

TRADING RULES:
1. Only trade assets in UPTREND or STRONG_UPTREND
2. Higher confidence = larger position (within limits)
3. Target ${config.TARGET_PROFIT}% profit per trade
4. Use ${leverage}x leverage on high-conviction trades only
5. Prioritize trades with best risk/reward ratio

Return ONLY JSON array with your TOP ${config.TOP_TRADES_PER_CYCLE} trade decisions:
[{"symbol":"BTC","action":"buy","confidence":0.85,"reason":"Strong uptrend with momentum","pattern":"trend_continuation","size_percent":${Math.min(30, maxPositionSize)},"leverage":${leverage}}]

Rules:
- confidence: ${config.MIN_CONFIDENCE} to 0.99
- action: "buy" only
- size_percent: 5-${maxPositionSize}
- leverage: 1-${leverage}
- If no uptrends available, return []`;

  try {
    console.log(`🤖 AI Trading Mode: ${leverage}x leverage, Risk: ${riskTolerance}`);
    
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
    // TREND FILTER: RSI strategy now requires 7d uptrend to avoid buying in downtrends
    const isIn7dUptrend = (coin as any).change7d > 0 || coin.change24h > 2;
    const isInDowntrend = coin.change24h < -5 || ((coin as any).change7d ?? 0) < -10;
    
    switch (bestStrategy) {
      case 'rsi':
        // TREND-FILTERED RSI - Only buy oversold in uptrending assets
        // FIX: Previous RSI was buying in downtrends, causing consistent losses
        if (isInDowntrend) {
          // SKIP: Don't buy RSI signals in downtrends
          console.log(`🛑 RSI SKIP: ${coin.symbol} in downtrend (24h: ${coin.change24h.toFixed(1)}%)`);
          break;
        }
        
        if (pricePosition < 0.25 && isIn7dUptrend) {
          action = 'buy';
          confidence = 0.90;
          reason = `🔥 RSI+TREND: Deep oversold (${(pricePosition * 100).toFixed(0)}%) in uptrend`;
          pattern = 'rsi_trend_bounce';
        } else if (pricePosition < 0.4 && coin.change24h > -2 && isIn7dUptrend) {
          action = 'buy';
          confidence = 0.80;
          reason = `📉 RSI+TREND: Oversold dip (${(pricePosition * 100).toFixed(0)}%) with trend support`;
          pattern = 'rsi_trend_dip';
        } else if (pricePosition < 0.5 && coin.change24h >= 0.5) {
          action = 'buy';
          confidence = 0.70;
          reason = `📊 RSI: Mid-range with positive momentum`;
          pattern = 'rsi_momentum';
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
    if (regime === 'trending') confidence *= 1.5;
    if (regime === 'high_volatility' && (bestStrategy === 'volatility_breakout' || bestStrategy === 'grid')) {
      confidence *= 1.2;
    }
    if (regime === 'ranging' && bestStrategy === 'rsi') confidence *= 1.15;
    
    // Lower threshold for more trades
    if (action !== 'hold' && confidence >= 0.50) {
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
  
  // Return top trades
  return decisions.sort((a, b) => b.confidence - a.confidence).slice(0, 15);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for action-based calls
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine for cron calls
    }

    // 🎛️ EXECUTE APPROVED TRADE - Patent: User-Confirmed Execution Mode
    // Handle execution of user-approved trades from the pending queue
    if (body.action === 'execute_approved_trade') {
      const { tradeId, symbol, side, quantity, price } = body;
      
      console.log(`✅ EXECUTING APPROVED TRADE: ${side} ${quantity} ${symbol} @ $${price}`);
      
      // Get user from the pending trade
      const { data: pendingTrade } = await supabase
        .from('pending_trades')
        .select('*')
        .eq('id', tradeId)
        .single();
      
      if (!pendingTrade) {
        return new Response(JSON.stringify({ error: 'Pending trade not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      const userId = pendingTrade.user_id;
      
      // Get user settings
      const { data: settings } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      const isPaperMode = settings?.trading_mode !== 'live';

      // 🧯 DUPLICATE TRADE GUARD (approved-trade execution path)
      // Prevent accidental repeated approvals/retries stacking the same trade.
      if (side === 'buy') {
        const { data: existingPosition } = await supabase
          .from('positions')
          .select('id')
          .eq('user_id', userId)
          .eq('symbol', symbol)
          .eq('is_paper', isPaperMode)
          .maybeSingle();

        if (existingPosition) {
          return new Response(JSON.stringify({
            error: 'Duplicate trade prevented',
            details: `Already holding ${symbol} - not opening another buy position.`,
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const recentCutoff = new Date(Date.now() - DUPLICATE_TRADE_COOLDOWN_MINUTES * 60 * 1000).toISOString();
      const { data: recentSameTrade } = await supabase
        .from('trades')
        .select('id, created_at')
        .eq('user_id', userId)
        .eq('symbol', symbol)
        .eq('side', side)
        .eq('is_paper', isPaperMode)
        .gte('created_at', recentCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentSameTrade?.created_at) {
        return new Response(JSON.stringify({
          error: 'Duplicate trade prevented',
          details: `A ${side.toUpperCase()} ${symbol} trade was already created recently (${recentSameTrade.created_at}).`,
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let actualQuantity = quantity;
      let actualPrice = price;
      
      // Execute real trade if in live mode
      if (!isPaperMode && side === 'buy') {
        const tradeValue = quantity * price;
        console.log(`💰 EXECUTING REAL COINBASE BUY: $${tradeValue.toFixed(2)} of ${symbol}`);
        const buyResult = await executeCoinbaseBuy(symbol, tradeValue);
        
        if (buyResult.success && buyResult.quantity && buyResult.price) {
          actualQuantity = buyResult.quantity;
          actualPrice = buyResult.price;
          console.log(`✅ REAL TRADE SUCCESS: ${actualQuantity} ${symbol} @ $${actualPrice}`);
        } else {
          console.error(`❌ REAL BUY FAILED: ${buyResult.error}`);
          return new Response(JSON.stringify({ 
            error: 'Trade execution failed', 
            details: buyResult.error 
          }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
      
      // Create trade record
      const { error: tradeError } = await supabase
        .from('trades')
        .insert({
          user_id: userId,
          symbol,
          side,
          quantity: actualQuantity,
          entry_price: actualPrice,
          market_type: 'crypto',
          is_paper: isPaperMode,
          status: 'open',
          strategy: pendingTrade.strategy,
          ai_reasoning: pendingTrade.ai_reasoning,
        });
      
      if (tradeError) {
        console.error('Trade insert error:', tradeError);
      }
      
      // Create position
      const { error: positionError } = await supabase
        .from('positions')
        .insert({
          user_id: userId,
          symbol,
          side,
          quantity: actualQuantity,
          avg_entry_price: actualPrice,
          market_type: 'crypto',
          is_paper: isPaperMode,
          strategy: pendingTrade.strategy,
        });
      
      if (positionError) {
        console.error('Position insert error:', positionError);
      }
      
      // Update paper account if in paper mode
      if (isPaperMode) {
        const { data: paperAccount } = await supabase
          .from('paper_account')
          .select('balance')
          .eq('user_id', userId)
          .single();
        
        if (paperAccount) {
          const newBalance = paperAccount.balance - (actualQuantity * actualPrice);
          await supabase
            .from('paper_account')
            .update({ balance: newBalance })
            .eq('user_id', userId);
        }
      }
      
      return new Response(JSON.stringify({
        success: true,
        message: `Executed ${side} ${actualQuantity.toFixed(6)} ${symbol} @ $${actualPrice.toFixed(2)}`,
        trade: {
          symbol,
          side,
          quantity: actualQuantity,
          price: actualPrice,
          value: actualQuantity * actualPrice,
          isPaperMode,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    // Use EQUITY (cash + open position value) as the base, not just cash,
    // otherwise cash collapses as positions are opened and the limit becomes meaningless.
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: openPosRows } = await supabase
      .from('positions')
      .select('quantity, avg_entry_price, current_price')
      .eq('user_id', user.id)
      .eq('is_paper', isPaperMode);

    const positionsValue = (openPosRows || []).reduce((sum: number, p: any) => {
      const px = Number(p.current_price) || Number(p.avg_entry_price) || 0;
      return sum + (Number(p.quantity) || 0) * px;
    }, 0);
    const equityBase = Math.max(balance + positionsValue, 1000);

    const { data: todaysTrades } = await supabase
      .from('trades')
      .select('pnl')
      .eq('user_id', user.id)
      .eq('is_paper', isPaperMode)
      .gte('created_at', todayStart.toISOString());

    const todaysLoss = (todaysTrades || []).reduce((sum, t) => sum + (t.pnl && t.pnl < 0 ? t.pnl : 0), 0);
    const maxDailyLossAmount = equityBase * ((settings.max_daily_loss || 5) / 100);

    if (Math.abs(todaysLoss) >= maxDailyLossAmount) {
      console.log(`🛑 DAILY LOSS LIMIT HIT: Lost $${Math.abs(todaysLoss).toFixed(2)} (max: $${maxDailyLossAmount.toFixed(2)} on equity $${equityBase.toFixed(2)})`);

      await supabase
        .from('ai_settings')
        .update({ bot_status: 'idle', updated_at: new Date().toISOString() })
        .eq('user_id', user.id);

      return new Response(JSON.stringify({
        message: 'Daily loss limit reached - trading paused',
        todaysLoss: Math.abs(todaysLoss),
        maxDailyLoss: maxDailyLossAmount,
        equity: equityBase,
        status: 'daily_limit'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📊 Daily P&L: $${todaysLoss.toFixed(2)} (limit: -$${maxDailyLossAmount.toFixed(2)} on equity $${equityBase.toFixed(2)})`);

    // ==========================================================================
    // MULTI-ASSET MARKET DATA FETCHING
    // PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
    // ==========================================================================
    const allowedMarkets = settings.allowed_markets || ['crypto'];
    let marketData: MarketData[] = [];
    let stockData: MarketData[] = [];
    
    // Fetch crypto data if allowed
    if (allowedMarkets.includes('crypto')) {
      console.log('📊 Fetching crypto market data...');
      const cryptoData = await fetchMarketData();
      marketData.push(...cryptoData);
    }
    
    // Fetch stock data if allowed AND market is open
    if (allowedMarkets.includes('stocks')) {
      if (isStockMarketOpen()) {
        console.log('📈 Fetching stock market data (market is OPEN)...');
        stockData = await fetchStockMarketData();
        
        // Check if user has a stock broker connected
        const stockBroker = await getConnectedStockBroker(supabase, user.id);
        if (stockBroker) {
          console.log(`🏦 Stock broker connected: ${stockBroker.broker}`);
          marketData.push(...stockData);
        } else {
          console.log('⚠️ No stock broker connected - skipping stock trades');
        }
      } else {
        console.log('📊 Stock market CLOSED - only trading crypto');
      }
    }
    
    if (marketData.length === 0) {
      return new Response(JSON.stringify({ error: 'Could not fetch market data', status: 'error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`📊 Total tradeable assets: ${marketData.length} (Crypto: ${marketData.length - stockData.length}, Stocks: ${stockData.length})`);
    
    // Create a set of stock symbols for later routing
    const stockSymbols = new Set(stockData.map(s => s.symbol));

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

    // 👥 COPY TRADING PRIORITY - Boost assets from followed traders' best performing assets
    const { data: followedTraders } = await supabase
      .from('followed_traders')
      .select('trader_id, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true);
    
    if (followedTraders && followedTraders.length > 0) {
      console.log(`👥 Copy Trading: ${followedTraders.length} followed traders found`);
      
      // Get the top_traders data for followed traders
      const traderIds = followedTraders.map((f: any) => f.trader_id);
      const { data: traders } = await supabase
        .from('top_traders')
        .select('id, display_name, best_performing_assets, win_rate')
        .in('id', traderIds);
      
      if (traders && traders.length > 0) {
        // Collect all best performing assets from followed traders
        const copyTradeAssets: Map<string, { count: number; avgWinRate: number }> = new Map();
        
        traders.forEach((trader: any) => {
          const assets = trader.best_performing_assets || [];
          const winRate = trader.win_rate || 50;
          
          assets.forEach((asset: string) => {
            const normalized = asset.toUpperCase();
            const existing = copyTradeAssets.get(normalized);
            if (existing) {
              existing.count += 1;
              existing.avgWinRate = (existing.avgWinRate + winRate) / 2;
            } else {
              copyTradeAssets.set(normalized, { count: 1, avgWinRate: winRate });
            }
          });
        });
        
        if (copyTradeAssets.size > 0) {
          console.log(`📋 Copy Trade Priority Assets (from ${traders.length} traders):`);
          copyTradeAssets.forEach((data, symbol) => {
            console.log(`   ${symbol}: ${data.count} trader(s), avg win rate: ${data.avgWinRate.toFixed(1)}%`);
          });
          
          // Re-sort tradeable to prioritize copy trade assets
          prioritizedTradeable = [...prioritizedTradeable].sort((a, b) => {
            const aData = copyTradeAssets.get(a.symbol);
            const bData = copyTradeAssets.get(b.symbol);
            
            // Score: count * avgWinRate (higher = better)
            const aScore = aData ? aData.count * aData.avgWinRate : 0;
            const bScore = bData ? bData.count * bData.avgWinRate : 0;
            
            // If both have copy trade priority, sort by score
            if (aScore > 0 && bScore > 0) return bScore - aScore;
            // Copy trade assets come first
            if (aScore > 0) return -1;
            if (bScore > 0) return 1;
            // Otherwise keep existing order
            return 0;
          });
          
          console.log(`📊 Final priority order: ${prioritizedTradeable.slice(0, 10).map(c => {
            const data = copyTradeAssets.get(c.symbol);
            return data ? `${c.symbol}(👥${data.count})` : c.symbol;
          }).join(', ')}${prioritizedTradeable.length > 10 ? '...' : ''}`);
        }
      }
    } else {
      console.log('👥 No followed traders - using standard priority');
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

    // 🧠 AI TRADING MODE - Risk tolerance drives behavior
    const leverage = settings.max_leverage || 3;
    const riskTolerance = settings.risk_tolerance || 'moderate';
    const optimalLeverage = calculateOptimalLeverage(leverage, riskTolerance);
    
    console.log(`🚀 AI Trading: ${optimalLeverage}x leverage, Risk: ${riskTolerance}, Balance: $${balance.toFixed(2)}`);
    let decisions = await analyzeWithAI(prioritizedTradeable, balance, settings.max_position_size, trendAnalysis, bestStrategy, regime, optimalLeverage, riskTolerance);
    
    // Fallback to strategy-specific rule-based if AI returns nothing
    if (decisions.length === 0) {
      console.log('📊 AI returned no decisions, using strategy-specific rules');
      decisions = analyzeWithRules(prioritizedTradeable, regime, settings.max_position_size, balance, bestStrategy);
    }

    // 🛡️ LOSS PREVENTION FILTER - Block symbols that recently lost money
    const lossCooldownMap = await getRecentLosingSymbols(supabase, user.id, isPaperMode, 6, 2);
    
    // Double-check: Filter out any decisions for coins in downtrend OR recent losses (safety net)
    decisions = decisions.filter(d => {
      // Check trend
      const trend = trendAnalysis.find(t => t.symbol === d.symbol);
      if (trend && !trend.shouldTrade) {
        console.log(`🛡️ Safety filter: Blocking ${d.action} on ${d.symbol} - in ${trend.trend}`);
        return false;
      }
      
      // Check loss cooldown
      const lossCheck = shouldBlockSymbolDueToLosses(d.symbol, lossCooldownMap, 6, 2);
      if (lossCheck.blocked) {
        console.log(lossCheck.reason);
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

    // 🎛️ EXECUTION MODE CHECK - Patent: Selectable Execution Control Modes
    // If user_confirmed mode, queue trades for approval instead of executing
    const executionMode = settings.execution_mode || 'autonomous';
    
    if (executionMode === 'user_confirmed') {
      console.log(`🔔 USER-CONFIRMED MODE: Queueing ${limitedDecisions.length} trades for approval`);
      
      const pendingTrades: any[] = [];
      
      for (const decision of limitedDecisions) {
        if (decision.action === 'hold') continue;
        
        const coinData = marketData.find(m => m.symbol === decision.symbol);
        if (!coinData) continue;
        
        // Calculate position value
        const maxCapitalUsage = settings.max_capital_usage || 80;
        const availableCapital = balance * (maxCapitalUsage / 100);
        const decisionSizePercent = (decision as any).size_percent || settings.max_position_size || 10;
        const tradeValue = Math.max(availableCapital * (decisionSizePercent / 100) * decision.confidence, 5);
        const quantity = tradeValue / coinData.price;
        
        // Insert pending trade for user approval
        const { error: pendingError } = await supabase
          .from('pending_trades')
          .insert({
            user_id: user.id,
            symbol: decision.symbol,
            side: decision.action,
            quantity,
            price: coinData.price,
            position_value: tradeValue,
            strategy: bestStrategy,
            ai_reasoning: decision.reason,
            confidence: decision.confidence,
            market_regime: regime,
            status: 'pending',
            expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
          });
        
        if (!pendingError) {
          pendingTrades.push({
            symbol: decision.symbol,
            side: decision.action,
            quantity,
            price: coinData.price,
            value: tradeValue,
            confidence: decision.confidence,
          });
          console.log(`📋 Queued: ${decision.action.toUpperCase()} ${quantity.toFixed(6)} ${decision.symbol} @ $${coinData.price.toFixed(2)}`);
        } else {
          console.error(`Failed to queue pending trade for ${decision.symbol}:`, pendingError);
        }
      }
      
      return new Response(JSON.stringify({
        status: 'queued_for_approval',
        executionMode: 'user_confirmed',
        message: `${pendingTrades.length} trade(s) queued for your approval`,
        pendingTrades,
        regime,
        strategy: bestStrategy,
        balance,
        isPaperMode,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 🤖 AUTONOMOUS MODE - Execute trades directly
    console.log(`🤖 AUTONOMOUS MODE: Executing ${limitedDecisions.length} trades directly`);
    
    const executedTrades: any[] = [];
    let tradesExecuted = 0;

    // Build duplicate-trade guard state once per run (fast + consistent)
    const lastTradeByKey = await getRecentTradeKeys(
      supabase,
      user.id,
      isPaperMode,
      DUPLICATE_TRADE_COOLDOWN_MINUTES
    );
    const openPositionSymbols = await getOpenPositionSymbols(supabase, user.id, isPaperMode);
    console.log(
      `🧯 Duplicate guard: ${openPositionSymbols.size} open symbol(s), ${lastTradeByKey.size} recent trade key(s) (cooldown ${DUPLICATE_TRADE_COOLDOWN_MINUTES}m)`
    );

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

      // 🧯 DUPLICATE TRADE GUARD
      // 1) Never open a new BUY if we already have an open position in that symbol
      // 2) Never repeat the same (symbol+side) within the cooldown window
      const symbolUpper = String(decision.symbol).toUpperCase();
      const side = decision.action as TradeSide;
      const key = tradeKey(symbolUpper, side);
      const lastAt = lastTradeByKey.get(key);

      if (side === 'buy' && openPositionSymbols.has(symbolUpper)) {
        console.log(`🧯 SKIP duplicate BUY: already holding ${symbolUpper}`);
        continue;
      }

      if (lastAt && Date.now() - lastAt < DUPLICATE_TRADE_COOLDOWN_MINUTES * 60 * 1000) {
        const minsAgo = (Date.now() - lastAt) / (1000 * 60);
        console.log(
          `🧯 SKIP duplicate ${side.toUpperCase()} ${symbolUpper}: last ${minsAgo.toFixed(1)}m ago (cooldown ${DUPLICATE_TRADE_COOLDOWN_MINUTES}m)`
        );
        continue;
      }

      // 🚀 AUTONOMOUS LEVERAGED TRADING - Uses YOUR configured parameters
      const MIN_TRADE_VALUE = 1.00;
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
      
      if (preRoundedQty <= 0 || prePositionValue < MIN_TRADE_VALUE) {
        console.log(`⚠️ SKIPPING zero-quantity trade: ${decision.symbol} - qty=${quantity} rounds to ${preRoundedQty}, value=$${prePositionValue.toFixed(2)}`);
        continue;
      }
      
      console.log(`✅ Pre-validated: ${decision.symbol} qty=${preRoundedQty} ($${prePositionValue.toFixed(2)})`);

      // 🛡️ RISK MANAGER VALIDATION - Must pass before execution
      // Calculate current open positions value and unrealized P&L for risk check
      const { data: currentPositions } = await supabase
        .from('positions')
        .select('quantity, avg_entry_price, unrealized_pnl')
        .eq('user_id', user.id)
        .eq('is_paper', isPaperMode);
      
      const openPositionsValue = (currentPositions || []).reduce(
        (sum, p) => sum + (p.quantity * p.avg_entry_price), 
        0
      );
      
      const openPositionsUnrealizedPnl = (currentPositions || []).reduce(
        (sum, p) => sum + (p.unrealized_pnl || 0),
        0
      );
      
      // Live buys must include a protective stop for risk validation.
      // Use the small-account scalp stop (-2%) while keeping the validation
      // risk within the 1% equity risk budget enforced by RiskManager.
      const maxRiskPerTradePct = 1;
      const maxStopDistancePct = Math.max(
        0.0025,
        Math.min(0.02, (balance * (maxRiskPerTradePct / 100)) / prePositionValue)
      );
      const defaultStopLoss = decision.action === 'buy'
        ? actualEntryPrice * (1 - maxStopDistancePct)
        : undefined;
      
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
        openPositionsValue,
        openPositionsUnrealizedPnl
      );

      if (!riskValidation.approved) {
        console.log(`🛡️ RISK MANAGER BLOCKED: ${decision.symbol} - ${riskValidation.reason}`);
        console.log(`   Violations: ${riskValidation.violations.join(', ')}`);
        continue; // Skip this trade
      }
      
      console.log(`✅ RISK APPROVED: ${decision.symbol} - ${riskValidation.reason}`);

      // ==========================================================================
      // MULTI-ASSET TRADE EXECUTION
      // PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
      // Route trades to appropriate broker based on asset type
      // ==========================================================================
      const isStock = stockSymbols.has(decision.symbol);
      const marketType = isStock ? 'stocks' : 'crypto';
      
      if (!isPaperMode && decision.action === 'buy') {
        if (isStock) {
          // 📈 EXECUTE STOCK TRADE via connected broker (Alpaca/IBKR/Tradier)
          console.log(`📈 EXECUTING STOCK ${decision.action.toUpperCase()}: ${quantity} ${decision.symbol}`);
          const stockResult = await executeStockTrade(
            supabase,
            user.id,
            decision.symbol,
            decision.action,
            Math.floor(quantity), // Stocks are whole shares
            isPaperMode
          );
          
          if (stockResult.success && stockResult.quantity) {
            quantity = stockResult.quantity;
            if (stockResult.price) actualEntryPrice = stockResult.price;
            console.log(`✅ STOCK TRADE EXECUTED: ${quantity} ${decision.symbol} @ $${actualEntryPrice}`);
          } else {
            console.error(`❌ STOCK TRADE FAILED for ${decision.symbol}: ${stockResult.error}`);
            continue;
          }
        } else {
          // 💰 EXECUTE CRYPTO TRADE via Coinbase
          console.log(`💰 EXECUTING REAL COINBASE BUY: $${tradeValue.toFixed(2)} of ${decision.symbol}`);
          const buyResult = await executeCoinbaseBuy(decision.symbol, tradeValue);
          
          if (buyResult.success && buyResult.quantity && buyResult.price) {
            quantity = buyResult.quantity;
            actualEntryPrice = buyResult.price;
            
            // DUST PREVENTION: Verify the quantity we received is sellable
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
              continue;
            }
            
            console.log(`✅ REAL TRADE EXECUTED: ${quantity} ${decision.symbol} @ $${actualEntryPrice} (sellable: ${roundedQty})`);
          } else {
            console.error(`❌ REAL BUY FAILED for ${decision.symbol}: ${buyResult.error}`);
            continue;
          }
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
        market_type: marketType as 'crypto' | 'stocks',
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

      // FIX: Check for existing position BEFORE creating a new one to prevent duplicates
      const { data: existingPosition } = await supabase
        .from('positions')
        .select('id, quantity, avg_entry_price')
        .eq('user_id', user.id)
        .eq('symbol', decision.symbol)
        .eq('is_paper', isPaperMode)
        .maybeSingle();
      
      if (existingPosition) {
        // UPDATE existing position instead of creating duplicate
        const newQuantity = existingPosition.quantity + quantity;
        const newAvgPrice = ((existingPosition.quantity * existingPosition.avg_entry_price) + (quantity * actualEntryPrice)) / newQuantity;
        
        const { error: updateError } = await supabase
          .from('positions')
          .update({
            quantity: newQuantity,
            avg_entry_price: newAvgPrice,
            current_price: coinData.price,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPosition.id);
        
        if (updateError) {
          console.error(`❌ Error updating position for ${decision.symbol}:`, updateError);
        } else {
          console.log(`📊 UPDATED existing ${decision.symbol} position: +${quantity} @ $${actualEntryPrice} → Total: ${newQuantity.toFixed(6)} @ avg $${newAvgPrice.toFixed(4)}`);
        }
      } else {
        // Create NEW position (no existing position found)
        const { error: positionError } = await supabase.from('positions').insert({
          user_id: user.id,
          symbol: decision.symbol,
          side: decision.action,
          quantity,
          avg_entry_price: actualEntryPrice,
          current_price: coinData.price,
          market_type: marketType,
          is_paper: isPaperMode,
          strategy: strategyType,
          unrealized_pnl: 0,
        });

        if (positionError) {
          console.error(`❌ Error creating position for ${decision.symbol}:`, positionError);
        } else {
          const assetIcon = isStock ? '📈' : '🪙';
          console.log(`${assetIcon} Created NEW ${isPaperMode ? 'PAPER' : 'LIVE'} ${marketType.toUpperCase()} position: ${quantity} ${decision.symbol}`);
        }
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

      // Update in-memory duplicate guard state so we don't re-enter within this run
      lastTradeByKey.set(tradeKey(decision.symbol, decision.action as TradeSide), Date.now());
      if (decision.action === 'buy') openPositionSymbols.add(String(decision.symbol).toUpperCase());
      if (decision.action === 'sell') openPositionSymbols.delete(String(decision.symbol).toUpperCase());

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

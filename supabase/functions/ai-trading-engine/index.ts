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

const DUPLICATE_TRADE_COOLDOWN_MINUTES = 15; // scalp mode: prevent immediate re-entry / thrash on same symbol
const SCALP_MAX_POSITION_PCT = 5; // hard cap: each scalp position ≤ 5% of equity
const SCALP_MAX_CONCURRENT = 5; // hard cap: never more than 5 simultaneous scalps

// Defaults — overridden per-user by scalp_settings table via loadScalpCfg()
const SCALP_CFG_DEFAULTS = {
  entry_min_5m_pct: 0.3,
  entry_min_15m_pct: 0.2,
  entry_min_1h_pct: 0.3,
  entry_min_24h_pct: 0.3,
  reentry_breakout_pct: 0.25,
  chase_guard_minutes: 120,
  take_profit_pct: 1.0,
  trailing_drop_pct: 1.5,
  hard_stop_loss_pct: 3.0,
  momentum_rotation_min_pct: 0.5,
  loss_rotation_enabled: true,
  loss_rotation_max_loss_pct: -2.0,
  loss_rotation_momentum_edge_pct: 0.5,
  loss_rotation_min_age_sec: 300,
  loss_rotation_cooldown_sec: 60,
  max_concurrent_positions: 12,
  target_position_size_usd: 50,
  max_capital_usage_pct: 80,
};
type ScalpCfg = typeof SCALP_CFG_DEFAULTS;

async function loadScalpCfg(supabase: any, userId: string): Promise<ScalpCfg> {
  try {
    const { data } = await supabase
      .from('scalp_settings').select('*').eq('user_id', userId).maybeSingle();
    const cfg: ScalpCfg = { ...SCALP_CFG_DEFAULTS };
    if (data) {
      for (const k of Object.keys(SCALP_CFG_DEFAULTS) as (keyof ScalpCfg)[]) {
        if (data[k] !== null && data[k] !== undefined) (cfg as any)[k] = data[k];
      }
    }
    return cfg;
  } catch (e) {
    console.warn('loadScalpCfg fallback to defaults:', e);
    return { ...SCALP_CFG_DEFAULTS };
  }
}

// Legacy aliases so callers without a cfg fall back to defaults
const ENTRY_CONFIRM_MIN_5M_PCT = SCALP_CFG_DEFAULTS.entry_min_5m_pct;
const ENTRY_CONFIRM_MIN_15M_PCT = SCALP_CFG_DEFAULTS.entry_min_15m_pct;
const ENTRY_CONFIRM_MIN_24H_PCT = SCALP_CFG_DEFAULTS.entry_min_24h_pct;
const CHASE_GUARD_WINDOW_MINUTES = SCALP_CFG_DEFAULTS.chase_guard_minutes;
const REENTRY_BREAKOUT_CONFIRM_PCT = SCALP_CFG_DEFAULTS.reentry_breakout_pct;

function getEntryMomentumStatus(coin: MarketData, cfg: ScalpCfg) {
  const c5 = coin.change5m;
  const c1h = coin.change1h ?? 0;
  const c24 = coin.change24h ?? 0;
  const strict = c5 !== undefined && c5 >= cfg.entry_min_5m_pct && c1h >= cfg.entry_min_1h_pct && c24 >= cfg.entry_min_24h_pct;
  const steady = c5 !== undefined && c5 >= 0.03 && c1h >= 0;
  // Loose: AI is allowed to enter on any single positive short-window confirmation
  const loose = (c5 !== undefined && c5 > 0) || c1h > 0.1 || c24 > 0.5;
  return { ok: strict || steady || loose, mode: strict ? 'strict' : steady ? 'steady' : loose ? 'loose' : 'blocked', c5, c1h, c24 };
}

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

async function getRecentExits(
  supabase: any,
  userId: string,
  isPaperMode: boolean,
  windowMinutes: number
): Promise<Map<string, { exitPrice: number; closedAt: number }>> {
  const map = new Map<string, { exitPrice: number; closedAt: number }>();
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const { data: trades, error } = await supabase
    .from('trades')
    .select('symbol, exit_price, closed_at')
    .eq('user_id', userId)
    .eq('is_paper', isPaperMode)
    .eq('status', 'closed')
    .gte('closed_at', cutoff)
    .order('closed_at', { ascending: false })
    .limit(250);

  if (error) {
    console.log('⚠️ Chase guard: failed to fetch recent exits:', error.message || error);
    return map;
  }

  for (const t of trades || []) {
    if (!t.symbol || !t.exit_price || !t.closed_at) continue;
    const sym = String(t.symbol).toUpperCase();
    if (!map.has(sym)) {
      map.set(sym, { exitPrice: Number(t.exit_price), closedAt: new Date(t.closed_at).getTime() });
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
async function executeCoinbaseBuy(symbol: string, usdAmount: number, fallbackPrice = 0): Promise<{ success: boolean; quantity?: number; price?: number; error?: string }> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    console.log('⚠️ Coinbase API keys not configured, simulating buy');
    return { success: false, error: 'API keys not configured' };
  }
  
  try {
    const [rawSymbol, rawBaseIncrement] = symbol.split('|');
    const productId = rawSymbol.includes('-') ? rawSymbol : `${rawSymbol}-USDC`;
    const baseSymbol = productId.split('-')[0];
    const uri = `POST api.coinbase.com/api/v3/brokerage/orders`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    
    // Get current price for limit order
    const tickerUri = `GET api.coinbase.com/api/v3/brokerage/products/${productId}/ticker`;
    const tickerJwt = await generateCdpJwt(apiKey, apiSecret, tickerUri);
    const priceResponse = await fetch(`https://api.coinbase.com/api/v3/brokerage/products/${productId}/ticker`, {
      headers: { 'Authorization': `Bearer ${tickerJwt}` },
    });
    const priceData = await priceResponse.json();
    const currentPrice = parseFloat(priceData.price || '0') || fallbackPrice;
    
    const orderId = crypto.randomUUID();
    let orderBody: any;
    
    if (currentPrice > 0) {
      // Calculate quantity from USD amount
      const quantity = usdAmount / currentPrice;
      
      const baseIncrement = Number(rawBaseIncrement || '0.00000001') || 0.00000001;
      const precision = Math.max(0, Math.min(8, (baseIncrement.toString().split('.')[1] || '').length));
      const roundedQty = Math.floor(quantity / baseIncrement) * baseIncrement;
      
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
      console.log(`📤 LIMIT BUY ${roundedQty} ${baseSymbol} @ $${currentPrice.toFixed(4)} (maker fee: 0.4%)...`);
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
      const acceptedOrderId = result.success_response?.order_id || result.order_id;

      // If we already see a real fill in the immediate response, use it
      if (filledSize > 0 && avgPrice > 0 && (orderStatus === 'FILLED' || orderStatus === 'DONE')) {
        console.log(`✅ REAL BUY SUCCESS (immediate): ${filledSize} ${symbol} @ $${avgPrice.toFixed(4)}`);
        return { success: true, quantity: filledSize, price: avgPrice };
      }

      // 🛡️ PHANTOM-FILL GUARD
      // post_only LIMIT orders frequently sit unfilled. Previously we recorded the position
      // immediately at the limit price → phantom holdings (engine thinks it owns coins it doesn't).
      // Instead, poll Coinbase for up to ~5s. If filled, record the REAL fill. If not, cancel and skip.
      if (acceptedOrderId) {
        console.log(`⏳ Polling fill status for ${acceptedOrderId} (${baseSymbol})...`);
        let polledFilled = 0;
        let polledAvg = 0;
        let polledStatus = orderStatus || 'OPEN';
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const getUri = `GET api.coinbase.com/api/v3/brokerage/orders/historical/${acceptedOrderId}`;
            const getJwt = await generateCdpJwt(apiKey, apiSecret, getUri);
            const ordResp = await fetch(`https://api.coinbase.com/api/v3/brokerage/orders/historical/${acceptedOrderId}`, {
              headers: { 'Authorization': `Bearer ${getJwt}` },
            });
            const ordJson = await ordResp.json();
            const o = ordJson.order || {};
            polledStatus = o.status || polledStatus;
            polledFilled = parseFloat(o.filled_size || '0');
            polledAvg = parseFloat(o.average_filled_price || '0');
            if (polledStatus === 'FILLED' || polledStatus === 'DONE' || polledFilled > 0) break;
            if (polledStatus === 'CANCELLED' || polledStatus === 'EXPIRED' || polledStatus === 'FAILED') break;
          } catch (_) { /* keep polling */ }
        }

        if (polledFilled > 0 && polledAvg > 0) {
          console.log(`✅ REAL BUY FILLED after poll: ${polledFilled} ${baseSymbol} @ $${polledAvg.toFixed(4)}`);
          return { success: true, quantity: polledFilled, price: polledAvg };
        }

        // Not filled — cancel to avoid stray resting order, then refuse the trade (no phantom).
        try {
          const cancelUri = `POST api.coinbase.com/api/v3/brokerage/orders/batch_cancel`;
          const cancelJwt = await generateCdpJwt(apiKey, apiSecret, cancelUri);
          await fetch('https://api.coinbase.com/api/v3/brokerage/orders/batch_cancel', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${cancelJwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_ids: [acceptedOrderId] }),
          });
          console.log(`🚫 Cancelled unfilled post_only BUY ${acceptedOrderId} (${baseSymbol}) — refusing phantom position`);
        } catch (e) {
          console.log(`⚠️ Could not cancel ${acceptedOrderId}:`, e instanceof Error ? e.message : 'unknown');
        }
        return { success: false, error: `post_only LIMIT did not fill (status=${polledStatus}) — cancelled to prevent phantom position` };
      }

      console.error(`⚠️ Order accepted but no order_id returned for ${symbol}.`);
      return { success: false, error: `No order_id returned. Status: ${orderStatus}` };
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

// Market-sell entire base quantity on Coinbase (used by loss-rotation).
async function executeCoinbaseSell(productIdOrSymbol: string, baseQuantity: number, baseIncrement?: string): Promise<{ success: boolean; price?: number; quantity?: number; error?: string }> {
  const apiKey = Deno.env.get('COINBASE_API_KEY');
  const apiSecret = Deno.env.get('COINBASE_API_SECRET');
  if (!apiKey || !apiSecret) return { success: false, error: 'API keys not configured' };
  try {
    const productId = productIdOrSymbol.includes('-') ? productIdOrSymbol : `${productIdOrSymbol}-USDC`;
    const inc = Number(baseIncrement || '0.00000001') || 0.00000001;
    const precision = Math.max(0, Math.min(8, (inc.toString().split('.')[1] || '').length));
    const qty = Math.floor(baseQuantity / inc) * inc;
    if (qty <= 0) return { success: false, error: 'quantity below increment' };

    const uri = `POST api.coinbase.com/api/v3/brokerage/orders`;
    const jwt = await generateCdpJwt(apiKey, apiSecret, uri);
    const body = {
      client_order_id: crypto.randomUUID(),
      product_id: productId,
      side: 'SELL',
      order_configuration: { market_market_ioc: { base_size: qty.toFixed(precision) } },
    };
    console.log(`📤 LOSS-ROTATION SELL ${qty} ${productId} (market)`);
    const resp = await fetch('https://api.coinbase.com/api/v3/brokerage/orders', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await resp.json();
    if (resp.ok && result.success) {
      const filledSize = parseFloat(result.order?.filled_size || qty.toString());
      const avgPrice = parseFloat(result.order?.average_filled_price || '0');
      return { success: true, quantity: filledSize, price: avgPrice };
    }
    return { success: false, error: result.error_response?.message || JSON.stringify(result).slice(0, 300) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'unknown' };
  }
}

// LOSS ROTATION: when slots/cash are full and a stronger candidate exists,
// close the weakest red position (≤ 2% loss) to free room. Returns true if a swap happened.
async function tryLossRotation(
  supabase: any,
  userId: string,
  isPaperMode: boolean,
  marketData: MarketData[],
  topCandidate: MarketData,
  cfg: ScalpCfg = SCALP_CFG_DEFAULTS,
): Promise<boolean> {
  if (!cfg.loss_rotation_enabled) {
    console.log('🔁 LOSS-ROTATION: disabled by user settings');
    return false;
  }
  const MAX_LOSS_PCT = cfg.loss_rotation_max_loss_pct;
  const MIN_AGE_SEC = cfg.loss_rotation_min_age_sec;
  const MOMENTUM_EDGE = cfg.loss_rotation_momentum_edge_pct;
  const COOLDOWN_SEC = cfg.loss_rotation_cooldown_sec;

  const candC5 = topCandidate.change5m ?? 0;
  const candC1h = topCandidate.change1h ?? 0;
  if (candC5 < cfg.entry_min_5m_pct || candC1h < cfg.entry_min_1h_pct) {
    console.log(`🔁 LOSS-ROTATION: candidate ${topCandidate.symbol} not strong enough (5m ${candC5.toFixed(2)}%, 1h ${candC1h.toFixed(2)}%)`);
    return false;
  }

  // Cooldown — check ai_decisions for recent loss_rotation
  const sinceIso = new Date(Date.now() - COOLDOWN_SEC * 1000).toISOString();
  const { data: recent } = await supabase
    .from('ai_decisions')
    .select('id')
    .eq('user_id', userId)
    .eq('decision_type', 'loss_rotation')
    .gte('created_at', sinceIso)
    .limit(1);
  if (recent && recent.length > 0) {
    console.log(`🔁 LOSS-ROTATION: in cooldown (last swap < ${COOLDOWN_SEC}s ago)`);
    return false;
  }

  const { data: positions } = await supabase
    .from('positions')
    .select('id, symbol, side, quantity, avg_entry_price, created_at')
    .eq('user_id', userId)
    .eq('is_paper', isPaperMode);
  if (!positions || positions.length === 0) return false;

  const priceBySymbol = new Map(marketData.map(m => [m.symbol.toUpperCase(), m]));
  const cutoff = Date.now() - MIN_AGE_SEC * 1000;
  const candidates: Array<{ pos: any; pnlPct: number; c5: number; md?: MarketData }> = [];

  for (const pos of positions) {
    if (pos.symbol === topCandidate.symbol) continue;
    const md = priceBySymbol.get(String(pos.symbol).toUpperCase());
    if (!md || !md.price) continue;
    const entry = Number(pos.avg_entry_price) || 0;
    if (entry <= 0) continue;
    const pnlPct = pos.side === 'buy'
      ? ((md.price - entry) / entry) * 100
      : ((entry - md.price) / entry) * 100;
    if (pnlPct >= 0) continue; // only swap reds
    if (pnlPct < MAX_LOSS_PCT) continue; // don't realize more than -2%
    const ageMs = Date.now() - new Date(pos.created_at).getTime();
    if (ageMs < MIN_AGE_SEC * 1000) continue;
    const c5 = md.change5m ?? 0;
    if (candC5 < c5 + MOMENTUM_EDGE) continue;
    candidates.push({ pos, pnlPct, c5, md });
  }

  if (candidates.length === 0) {
    console.log(`🔁 LOSS-ROTATION: no eligible red positions to swap for ${topCandidate.symbol}`);
    return false;
  }

  // Pick weakest (most negative pnl, tiebreak lowest 5m)
  candidates.sort((a, b) => (a.pnlPct - b.pnlPct) || (a.c5 - b.c5));
  const victim = candidates[0];
  const { pos, pnlPct, c5, md } = victim;
  const qty = Number(pos.quantity);
  const exitPrice = md!.price;
  const proceeds = qty * exitPrice;
  const realizedPnl = (exitPrice - Number(pos.avg_entry_price)) * qty * (pos.side === 'buy' ? 1 : -1);

  console.log(`🔁 LOSS ROTATION: closing ${pos.symbol} @ ${pnlPct.toFixed(2)}% (≈$${realizedPnl.toFixed(2)}) to free $${proceeds.toFixed(2)} for ${topCandidate.symbol} (5m +${candC5.toFixed(2)}% vs ${c5.toFixed(2)}%)`);

  // Execute the sell
  if (!isPaperMode) {
    const sellRes = await executeCoinbaseSell(md!.productId || pos.symbol, qty, md!.baseIncrement);
    if (!sellRes.success) {
      console.error(`❌ LOSS-ROTATION sell failed for ${pos.symbol}: ${sellRes.error}`);
      return false;
    }
  } else {
    // Paper: credit the paper account balance
    const { data: paperAcct } = await supabase
      .from('paper_account').select('balance').eq('user_id', userId).maybeSingle();
    if (paperAcct) {
      await supabase.from('paper_account')
        .update({ balance: Number(paperAcct.balance) + proceeds, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }
  }

  // Close the position row + record trade + decision + risk event
  await supabase.from('positions').delete().eq('id', pos.id);
  await supabase.from('trades').insert({
    user_id: userId,
    symbol: pos.symbol,
    side: 'sell',
    quantity: qty,
    entry_price: pos.avg_entry_price,
    exit_price: exitPrice,
    status: 'closed',
    market_type: 'crypto',
    strategy: 'scalp',
    pnl: realizedPnl,
    is_paper: isPaperMode,
    ai_reasoning: `Loss rotation: freed capital for ${topCandidate.symbol} (5m +${candC5.toFixed(2)}% vs held ${c5.toFixed(2)}%)`,
  });
  await supabase.from('ai_decisions').insert({
    user_id: userId,
    decision_type: 'loss_rotation',
    symbol: pos.symbol,
    action: 'sell',
    strategy: 'scalp',
    reasoning: `Swap → ${topCandidate.symbol}: candidate 5m +${candC5.toFixed(2)}% vs held 5m ${c5.toFixed(2)}%, realized ${pnlPct.toFixed(2)}%`,
    valid: true,
  });
  await supabase.from('risk_events').insert({
    user_id: userId,
    event_type: 'loss_rotation',
    severity: 'info',
    message: `Closed ${pos.symbol} at ${pnlPct.toFixed(2)}% to enter ${topCandidate.symbol}`,
    details: {
      closed_symbol: pos.symbol,
      target_symbol: topCandidate.symbol,
      realized_pnl: realizedPnl,
      pnl_pct: pnlPct,
      proceeds,
      candidate_5m: candC5,
      held_5m: c5,
      is_paper: isPaperMode,
    },
  });

  return true;
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
    
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/accounts?limit=250', {
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
  change1h?: number;
  change5m?: number;
  volume: number;
  high24h: number;
  low24h: number;
  productId?: string;
  baseIncrement?: string;
  quoteMinSize?: number;
  spreadPercent?: number;
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

// Fetch current crypto prices from Coinbase first so live execution can use every buyable Coinbase USDC market.
async function fetchMarketData(): Promise<MarketData[]> {
  try {
    const response = await fetch('https://api.coinbase.com/api/v3/brokerage/market/products?limit=500', {
      headers: { 'User-Agent': 'TitanAI-Trading-Engine/1.0' },
    });

    if (response.ok) {
      const data = await response.json();
      const products = Array.isArray(data?.products) ? data.products : [];
      const tradableUsdcMarkets = products
        .filter((product: any) => {
          const quote = String(product.quote_currency_id || '').toUpperCase();
          const base = String(product.base_currency_id || '').toUpperCase();
          const price = Number(product.price || product.mid_market_price || 0);
          return quote === 'USDC'
            && base
            && price > 0
            && product.status === 'online'
            && !product.is_disabled
            && !product.trading_disabled
            && !product.cancel_only
            && !product.view_only
            && product.product_type !== 'FUTURE';
        })
        .map((product: any) => {
          const price = Number(product.price || product.mid_market_price || 0);
          let high24h = Number(product.high_24h || 0);
          let low24h = Number(product.low_24h || 0);
          const volume = Number(product.approximate_quote_24h_volume || 0) || (Number(product.volume_24h || 0) * price);
          const bestBid = Number(product.best_bid_price || 0);
          const bestAsk = Number(product.best_ask_price || 0);
          const spreadPercent = bestBid > 0 && bestAsk > bestBid ? ((bestAsk - bestBid) / price) * 100 : undefined;
          const change24h = Number(product.price_percentage_change_24h || 0);
          if (!high24h || !low24h || high24h <= low24h) {
            const estimatedRangePct = Math.min(12, Math.max(1.8, Math.abs(change24h) * 1.4));
            high24h = price * (1 + estimatedRangePct / 200);
            low24h = price * (1 - estimatedRangePct / 200);
          }

          return {
            symbol: String(product.base_currency_id).toUpperCase(),
            price,
            change24h,
            // Coinbase market list does not expose 7d change; use 24h as the short-window trend proxy for scalp gating.
            change7d: change24h,
            volume,
            high24h,
            low24h,
            productId: product.product_id,
            baseIncrement: product.base_increment,
            quoteMinSize: Number(product.quote_min_size || 1),
            spreadPercent,
          } as MarketData;
        })
        .sort((a: MarketData, b: MarketData) => b.volume - a.volume);

      console.log(`📊 Fetched ${tradableUsdcMarkets.length} tradable Coinbase USDC markets`);
      if (tradableUsdcMarkets.length > 0) return tradableUsdcMarkets;
    } else {
      console.error('Coinbase products API error:', response.status);
    }
  } catch (error) {
    console.error('Error fetching Coinbase market data:', error);
  }

  // Fallback only if Coinbase market discovery fails.
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
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cryptos.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=1h,24h,7d&per_page=100`;
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
        change1h: coin.price_change_percentage_1h_in_currency || 0,
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
  
  // SAFETY: Never trade on hardcoded/stale prices. If both live price APIs failed,
  // return an empty market list so this tick is skipped instead of entering at fake
  // prices (which previously caused catastrophic losses like ETH $3100→$2091 when
  // the real market was nowhere near the mock value).
  console.error('❌ All price feeds failed — skipping this trading cycle (no mock fallback).');
  return [];

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

// Price filter — minimum $1, no upper cap (effectively unlimited)
const MAX_PRICE_USD = 1_000_000;
const MIN_PRICE_USD = 1.0;

// Meme-coin allowlist used when ai_settings.meme_coins_only is true.
// Price band is relaxed because most memes trade well below $1.
const MEME_COINS = new Set([
  'DOGE','SHIB','PEPE','FLOKI','BONK','WIF','MEME','BOME','MEW','POPCAT',
  'BRETT','NEIRO','TURBO','MOG','SPX','PNUT','GOAT','FARTCOIN','MOODENG','ACT',
  'CHILLGUY','SLERF','MYRO','BABYDOGE','MUMU','SNEK','AIDOGE','TRUMP','GIGA','PONKE',
  'MICHI','RETARDIO','DEGEN','TOSHI','KEYCAT','ANDY','MANEKI','SMOG','WEN','LADYS',
  'APU','HIGHER','MOTHER','DADDY','BAN','DOG','HOPPY','BABYBONK','VOLT','CAT'
]);
const MEME_MIN_PRICE_USD = 1e-9;
const MEME_MAX_PRICE_USD = 100;

// =============================================================================
// PARABOLIC MOVE FILTER - Prevents buying assets that have already pumped
// =============================================================================
const MAX_24H_CHANGE_FOR_ENTRY = 1;
const MIN_24H_CHANGE_FOR_ENTRY = -5;

// Fetch short-window (5m, 15m) momentum from Coinbase candles for a product.
// Returns { change5m, change15m } as percentages. null on failure.
async function fetchShortWindowMomentum(productId: string): Promise<{ change5m: number; change15m: number } | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    // Last ~20 min of 5-min candles (4 candles) — Coinbase returns [time, low, high, open, close, volume]
    const start = now - 60 * 25;
    const url = `https://api.coinbase.com/api/v3/brokerage/market/products/${productId}/candles?start=${start}&end=${now}&granularity=FIVE_MINUTE`;
    const resp = await fetch(url, { headers: { 'User-Agent': 'TitanAI-Trading-Engine/1.0' } });
    if (!resp.ok) return null;
    const data = await resp.json();
    const candles = Array.isArray(data?.candles) ? data.candles : [];
    if (candles.length < 2) return null;
    // Coinbase returns newest-first
    const sorted = [...candles].sort((a: any, b: any) => Number(a.start) - Number(b.start));
    const closes = sorted.map((c: any) => Number(c.close));
    const last = closes[closes.length - 1];
    const prev5 = closes[closes.length - 2];
    const prev15 = closes.length >= 4 ? closes[closes.length - 4] : closes[0];
    const change5m = prev5 > 0 ? ((last - prev5) / prev5) * 100 : 0;
    const change15m = prev15 > 0 ? ((last - prev15) / prev15) * 100 : 0;
    return { change5m, change15m };
  } catch (_e) {
    return null;
  }
}

// SCALP UNIVERSE FILTER: Buyable Coinbase assets that are RISING RIGHT NOW (5m + 1h positive).
// Async because we fetch short-window candles for the survivors of the pre-filter.
async function filterByTrend(
  marketData: MarketData[],
  cfg: ScalpCfg = SCALP_CFG_DEFAULTS,
  opts: { memeOnly?: boolean } = {}
): Promise<{ tradeable: MarketData[], trendAnalysis: TrendAnalysis[] }> {
  const memeOnly = !!opts.memeOnly;
  const minPrice = memeOnly ? MEME_MIN_PRICE_USD : MIN_PRICE_USD;
  const maxPrice = memeOnly ? MEME_MAX_PRICE_USD : MAX_PRICE_USD;

  // Pre-filter: stablecoins out, keep only coins within price band, 24h not deep red / not parabolic.
  // When memeOnly is true, restrict to the meme allowlist.
  const eligibleCoins = marketData.filter(coin => {
    const sym = coin.symbol.toUpperCase();
    const isStablecoin = STABLECOINS.includes(sym);
    const price = coin.price ?? 0;
    const outOfRange = price < minPrice || price > maxPrice;
    const change24h = coin.change24h ?? 0;

    if (isStablecoin) return false;
    if (memeOnly && !MEME_COINS.has(sym)) return false;
    if (outOfRange) return false;
    // AI-decides mode: wider 24h band; let AI + Fusion + liquidity pick winners.
    // Only prune extreme parabolics (already pumped) and deep capitulation candles.
    if (change24h < -8 || change24h >= 12) return false;
    return true;
  });

  console.log(`✅ Eligible coins (${memeOnly ? 'MEME-ONLY, ' : ''}$${minPrice}–$${maxPrice}, non-stable, 24h ∈ [-2%, +5%)): ${eligibleCoins.length}/${marketData.length}`);

  // Fetch 5m candles for eligible coins (Coinbase) — in parallel, capped to 30 to keep latency sane
  const candleTargets = eligibleCoins.slice(0, 30);
  await Promise.all(candleTargets.map(async (coin) => {
    if (!coin.productId) return;
    const m = await fetchShortWindowMomentum(coin.productId);
    if (m) {
      coin.change5m = m.change5m;
      // Use 15m as a 1h proxy when CoinGecko 1h is absent (live/Coinbase path)
      if (coin.change1h === undefined || coin.change1h === 0) {
        coin.change1h = m.change15m;
      }
    }
  }));

  // LIQUIDITY-AWARE AI-DECIDES GATE — let the AI pick; only block hard chase / no-data.
  const scalpCandidates = candleTargets.filter(coin => {
    const c5 = coin.change5m;
    const c1h = coin.change1h ?? 0;
    const c24 = coin.change24h ?? 0;
    const vol = coin.volume24h ?? 0;

    if (c5 === undefined && c1h === 0 && c24 === 0) {
      console.log(`⏭️  NO DATA: ${coin.symbol} — skipping (no momentum signal at all)`);
      return false;
    }
    // Hard chase guard: don't buy a candle that already ripped >4% in 5m
    if (c5 !== undefined && c5 > 4) {
      console.log(`🚫 ALREADY SPIKED: ${coin.symbol} 5m +${c5.toFixed(2)}% — too late to chase`);
      return false;
    }
    // Liquidity floor — AI needs depth to exit cleanly (relaxed to widen pool)
    if (vol > 0 && vol < 100_000) {
      console.log(`💧 LOW LIQUIDITY: ${coin.symbol} 24h vol $${(vol/1000).toFixed(0)}k — skipping`);
      return false;
    }
    console.log(`🤖 AI-CANDIDATE: ${coin.symbol} 5m ${(c5 ?? 0).toFixed(2)}% | 1h ${c1h.toFixed(2)}% | 24h ${c24.toFixed(2)}% | vol $${(vol/1e6).toFixed(2)}M`);
    return true;
  });

  // Rank by liquidity-weighted momentum: rising movers with depth first, then any liquid mover.
  scalpCandidates.sort((a, b) => {
    const score = (c: MarketData) => (c.change5m ?? 0) * 2 + (c.change1h ?? 0) + Math.log10(Math.max(1, c.volume24h ?? 1)) * 0.3;
    return score(b) - score(a);
  });

  console.log(`🎯 AI-DECIDES POOL: ${scalpCandidates.length} liquid candidates handed to AI`);

  const trendAnalysis: TrendAnalysis[] = scalpCandidates.map((coin: MarketData) => {
    const analysis = analyzeTrend(coin);
    return {
      ...analysis,
      shouldTrade: true,
      reason: `⚡ SCALP RISING: 5m +${(coin.change5m ?? 0).toFixed(2)}% | 1h +${(coin.change1h ?? 0).toFixed(2)}% | 24h +${(coin.change24h ?? 0).toFixed(2)}%`,
    };
  });

  console.log(`📈 Tradeable scalp candidates: ${scalpCandidates.length}`);

  return { tradeable: scalpCandidates, trendAnalysis };
}

// Strategy-specific trading logic descriptions - OPTIMIZED FOR FAST SCALPING
const strategyDescriptions: Record<string, string> = {
  scalp: 'PURE SCALP: Short-window momentum entries (0.5%–3% over last few minutes). Trailing stop arms at +1%, exits on 1.5% drop from peak; hard stop -2%. No traditional indicators.',
  rsi: 'DISABLED — scalp-only mode',
  ema_crossover: 'DISABLED — scalp-only mode',
  macd: 'DISABLED — scalp-only mode',
  trend_breakout: 'DISABLED — scalp-only mode',
  volatility_breakout: 'DISABLED — scalp-only mode',
  grid: 'DISABLED — scalp-only mode',
  dca: 'DISABLED — scalp-only mode',

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
  riskTolerance: string = 'moderate',
  fusionMap?: Map<string, { conviction: number; direction: string; drivers: any; rationale: string | null }>
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
${marketData.filter(m => m.price != null).map(m => `${m.symbol}: $${(m.price || 0).toFixed(2)} | 5m: ${(m.change5m || 0) > 0 ? '+' : ''}${(m.change5m || 0).toFixed(2)}% | 15m: ${(m.change1h || 0) > 0 ? '+' : ''}${(m.change1h || 0).toFixed(2)}% | 24h: ${(m.change24h || 0) > 0 ? '+' : ''}${(m.change24h || 0).toFixed(2)}% | Range: $${(m.low24h || 0).toFixed(2)}-$${(m.high24h || 0).toFixed(2)} | Vol: $${((m.volume || 0)/1e9).toFixed(1)}B`).join('\n')}

${fusionMap && fusionMap.size > 0 ? `TITAN FUSION SIGNALS (multi-source AI conviction, 0-100, fused from Polymarket prediction odds, news sentiment, liquidation clusters, technicals):
${marketData.filter(m => fusionMap.has(m.symbol.toUpperCase())).map(m => {
  const f = fusionMap.get(m.symbol.toUpperCase())!;
  const driverList = Array.isArray(f.drivers) ? f.drivers.slice(0, 3).join(', ')
    : (f.drivers && typeof f.drivers === 'object') ? Object.keys(f.drivers).slice(0, 3).join(', ')
    : '';
  return `${m.symbol}: conviction=${f.conviction} direction=${f.direction}${driverList ? ` drivers=[${driverList}]` : ''}${f.rationale ? ` — ${String(f.rationale).slice(0, 120)}` : ''}`;
}).join('\n')}

FUSION GUIDANCE: Strongly prefer symbols with conviction ≥ 65 AND direction in {bullish, long}. Treat fusion as your highest-priority filter when present; combine with short-window momentum to size confidence.` : 'TITAN FUSION SIGNALS: none available this cycle — rely on momentum + trend only.'}

TRADING RULES:
1. Only buy assets rising right now: prefer configured scalp thresholds, but allow steady micro-momentum when 5m, 15m, and 24h are all positive
2. Never buy dips, pullbacks, weak bounces, or assets with negative/flat 5m momentum
3. Higher confidence = larger position (within limits)
4. Target ${config.TARGET_PROFIT}% profit per trade
5. Use ${leverage}x leverage on high-conviction trades only
6. Prioritize trades with best risk/reward ratio

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

/**
 * Richer regime profile used to drive policy (size, slots, strategy, stand-down).
 * Independent of the DB enum so we can express "dead" and "volatile" without schema changes.
 *
 *  - trending_up      → aggressive scalping, full slots
 *  - trending_down    → reduced size, allow shorts only / tight stops
 *  - ranging          → grid / mean-reversion preferred, normal size
 *  - volatile         → reduced size + slots, raise confidence floor
 *  - dead             → no trading this cycle (insufficient movement to overcome fees)
 */
type RegimeProfile = 'trending_up' | 'trending_down' | 'ranging' | 'volatile' | 'dead';

interface RegimeReport {
  enumRegime: string;          // existing market_regime enum value (for DB)
  profile: RegimeProfile;      // policy-facing classification
  avg5mAbs: number;            // mean |5m| change across pool
  avg1hAbs: number;            // mean |1h| change across pool
  avg24h: number;              // signed mean 24h change
  dispersion24h: number;       // stdev of 24h change
  risersShare: number;         // share of coins with 5m>0
}

function classifyRegimeProfile(marketData: MarketData[]): RegimeReport {
  const enumRegime = detectMarketRegime(marketData);
  if (marketData.length === 0) {
    return { enumRegime, profile: 'dead', avg5mAbs: 0, avg1hAbs: 0, avg24h: 0, dispersion24h: 0, risersShare: 0 };
  }

  const c5s = marketData.map(m => Math.abs(m.change5m ?? 0));
  const c1s = marketData.map(m => Math.abs(m.change1h ?? 0));
  const c24s = marketData.map(m => m.change24h ?? 0);
  const avg5mAbs = c5s.reduce((a, b) => a + b, 0) / c5s.length;
  const avg1hAbs = c1s.reduce((a, b) => a + b, 0) / c1s.length;
  const avg24h = c24s.reduce((a, b) => a + b, 0) / c24s.length;
  const dispersion24h = Math.sqrt(c24s.reduce((s, x) => s + Math.pow(x - avg24h, 2), 0) / c24s.length);
  const risersShare = marketData.filter(m => (m.change5m ?? 0) > 0).length / marketData.length;

  // Dead: nothing is moving fast enough to scalp profitably after fees (~0.2% round-trip).
  // Require either visible short-window movement or a meaningful 1h drift.
  if (avg5mAbs < 0.15 && avg1hAbs < 0.4 && dispersion24h < 1.5) {
    return { enumRegime, profile: 'dead', avg5mAbs, avg1hAbs, avg24h, dispersion24h, risersShare };
  }

  // Dangerous volatility: wide dispersion or huge short-window swings → expect whipsaw
  if (dispersion24h > 7 || avg5mAbs > 1.2) {
    return { enumRegime, profile: 'volatile', avg5mAbs, avg1hAbs, avg24h, dispersion24h, risersShare };
  }

  // Trending: directional bias confirmed across multiple horizons
  if (avg24h > 1.5 && risersShare >= 0.55) {
    return { enumRegime, profile: 'trending_up', avg5mAbs, avg1hAbs, avg24h, dispersion24h, risersShare };
  }
  if (avg24h < -1.5 && risersShare <= 0.4) {
    return { enumRegime, profile: 'trending_down', avg5mAbs, avg1hAbs, avg24h, dispersion24h, risersShare };
  }

  return { enumRegime, profile: 'ranging', avg5mAbs, avg1hAbs, avg24h, dispersion24h, risersShare };
}

/**
 * Regime-driven policy: strategy preference, position sizing, slot count, confidence floor.
 * This is the long-term "learn the market state, adapt behavior" layer.
 */
interface RegimePolicy {
  strategy: 'scalp' | 'grid' | 'none';
  sizeMultiplier: number;       // applied to dynMaxPositionSize
  slotMultiplier: number;       // applied to dynMaxConcurrent
  minConfidenceBoost: number;   // added to the AI/rule confidence floor
  skipTrading: boolean;         // dead market → stand down
  rationale: string;
}

function getRegimePolicy(report: RegimeReport): RegimePolicy {
  switch (report.profile) {
    case 'dead':
      return {
        strategy: 'none', sizeMultiplier: 0, slotMultiplier: 0, minConfidenceBoost: 0, skipTrading: true,
        rationale: `Dead market — avg|5m| ${report.avg5mAbs.toFixed(2)}%, avg|1h| ${report.avg1hAbs.toFixed(2)}%. Movement too small to clear fees; standing down.`,
      };
    case 'volatile':
      return {
        strategy: 'scalp', sizeMultiplier: 0.5, slotMultiplier: 0.5, minConfidenceBoost: 0.15, skipTrading: false,
        rationale: `Volatile regime — dispersion ${report.dispersion24h.toFixed(1)}%. Reduced size and slots, raised confidence floor.`,
      };
    case 'trending_up':
      return {
        strategy: 'scalp', sizeMultiplier: 1.2, slotMultiplier: 1.0, minConfidenceBoost: -0.05, skipTrading: false,
        rationale: `Trend-up — avg24h ${report.avg24h.toFixed(2)}%, ${(report.risersShare * 100).toFixed(0)}% rising. Aggressive scalping.`,
      };
    case 'trending_down':
      return {
        strategy: 'scalp', sizeMultiplier: 0.4, slotMultiplier: 0.4, minConfidenceBoost: 0.2, skipTrading: false,
        rationale: `Trend-down — avg24h ${report.avg24h.toFixed(2)}%. Only highest-conviction longs, small size.`,
      };
    case 'ranging':
    default:
      return {
        strategy: 'grid', sizeMultiplier: 0.8, slotMultiplier: 1.0, minConfidenceBoost: 0.05, skipTrading: false,
        rationale: `Ranging — avg24h ${report.avg24h.toFixed(2)}%, dispersion ${report.dispersion24h.toFixed(1)}%. Grid/mean-reversion preferred.`,
      };
  }
}

// SCALPING ONLY: Traditional strategies (RSI/EMA/MACD/grid/DCA/breakout) are disabled.
// The bot exclusively runs the unified scalp entry — short-window momentum with
// trailing/hard stops handled in auto-take-profit. This matches scalping-replay.
async function getBestStrategyForRegime(_supabase: any, _userId: string, _regime: string): Promise<string> {
  console.log(`⚡ SCALP-ONLY mode: ignoring traditional strategies, using pure momentum scalp`);
  return 'scalp';
}


// ============= SIGNAL SCORING (0-100) — synthesized from per-coin metrics =============
function buildSignalFactors(coin: any, _regime: string, confidence: number, side: 'buy' | 'sell') {
  const priceRange = (coin.high24h ?? coin.price) - (coin.low24h ?? coin.price);
  const pricePosition = priceRange > 0 ? (coin.price - coin.low24h) / priceRange : 0.5;
  const volPct = priceRange > 0 ? (priceRange / coin.price) * 100 : 0;
  const ch24 = coin.change24h ?? 0;
  const ch7d = (coin as any).change7d ?? ch24;
  const clamp = (x: number) => Math.max(0, Math.min(1, x));

  const trend = side === 'buy'
    ? clamp((ch24 > 0 ? 0.6 : 0.2) + (ch7d > 0 ? 0.3 : 0))
    : clamp((ch24 < 0 ? 0.6 : 0.2) + (ch7d < 0 ? 0.3 : 0));
  const emaAlignment = clamp(1 - Math.abs(ch24 - ch7d) / 10);
  const rsiScore = side === 'buy' ? clamp(1 - pricePosition + 0.1) : clamp(pricePosition + 0.1);
  const macdScore = side === 'buy' ? (ch24 > 0 ? 0.85 : 0.35) : (ch24 < 0 ? 0.85 : 0.35);
  const vwapScore = side === 'buy' ? (pricePosition > 0.5 ? 0.8 : 0.5) : (pricePosition < 0.5 ? 0.8 : 0.5);
  const volume = 0.6;
  const sr = side === 'buy' ? clamp(1 - pricePosition + 0.2) : clamp(pricePosition + 0.2);
  const volatility = volPct < 0.2 ? 0.3 : volPct > 6 ? 0.25 : clamp(1 - Math.abs(volPct - 1.5) / 3);
  const riskReward = clamp((confidence - 0.5) * 1.5);

  const W = { trend: 18, emaAlignment: 14, rsi: 12, macd: 10, vwap: 10, volume: 12, sr: 8, volatility: 8, riskReward: 8 };
  const total = Math.round(
    trend * W.trend + emaAlignment * W.emaAlignment + rsiScore * W.rsi + macdScore * W.macd +
    vwapScore * W.vwap + volume * W.volume + sr * W.sr + volatility * W.volatility + riskReward * W.riskReward
  );
  const rr = Math.max(1, confidence * 2.5);
  const valid = total >= 75 && rr >= 1.5;

  return {
    trend_score: Math.round(trend * 100) / 100,
    ema_alignment_score: Math.round(emaAlignment * 100) / 100,
    rsi_score: Math.round(rsiScore * 100) / 100,
    macd_score: Math.round(macdScore * 100) / 100,
    vwap_score: Math.round(vwapScore * 100) / 100,
    volume_score: Math.round(volume * 100) / 100,
    sr_score: Math.round(sr * 100) / 100,
    volatility_score: Math.round(volatility * 100) / 100,
    risk_reward_score: Math.round(riskReward * 100) / 100,
    total_score: total,
    risk_reward: Math.round(rr * 100) / 100,
    valid,
  };
}

// ─── Volatility / regime / leverage / grid / liq-map helpers ────────────────
// Mirror of src/lib/volatility.ts (edge functions can't import from src/).
function classifyVol(rangePct: number): 'low' | 'normal' | 'high' | 'extreme' {
  const v = rangePct / 2; // approx ATR% from 24h range
  if (v < 1.5) return 'low';
  if (v < 4) return 'normal';
  if (v < 8) return 'high';
  return 'extreme';
}

function computeEffectiveLeverage(userCap: number, regime: string, rangePct: number): { leverage: number; reason: string } {
  const cap = Math.max(1, userCap);
  const cls = classifyVol(rangePct);
  if (regime === 'news_driven') return { leverage: Math.min(cap, 1), reason: 'news regime' };
  if (regime === 'high_volatility' || cls === 'extreme') return { leverage: Math.min(cap, 2), reason: 'high vol' };
  if (cls === 'high') return { leverage: Math.min(cap, Math.max(2, Math.floor(cap * 0.5))), reason: 'elevated vol' };
  if (regime === 'ranging') return { leverage: Math.min(cap, Math.max(2, Math.floor(cap * 0.7))), reason: 'ranging' };
  if (regime === 'trending' && cls === 'low') return { leverage: cap, reason: 'clean trend' };
  return { leverage: Math.min(cap, Math.max(2, Math.floor(cap * 0.8))), reason: 'standard' };
}

// Dynamic-grid entry decision: returns whether to enter and which grid level we're at.
function dynamicGridDecision(coin: MarketData, regime: string): { enter: boolean; confidence: number; reason: string; pattern: string } {
  const range = coin.high24h - coin.low24h;
  if (range <= 0) return { enter: false, confidence: 0, reason: '', pattern: '' };
  const rangePct = (range / coin.price) * 100;
  // Use range/8 as ATR proxy when no historical bars available.
  const atr = range / 8;
  const multiplier = regime === 'low_volatility' ? 0.5 : regime === 'high_volatility' ? 1.5 : 1.0;
  const spacing = Math.max(atr * multiplier, coin.price * 0.003);
  const center = (coin.high24h + coin.low24h) / 2;
  const distFromCenter = coin.price - center;
  const levelsBelow = distFromCenter < 0 ? Math.floor(Math.abs(distFromCenter) / spacing) : 0;
  const pricePosition = (coin.price - coin.low24h) / range;

  // Only enter on grid buys at discrete levels below center, and only in good grid regimes.
  if (regime === 'news_driven' || regime === 'high_volatility') {
    return { enter: false, confidence: 0, reason: '', pattern: '' };
  }
  if (levelsBelow >= 1 && pricePosition < 0.55 && rangePct >= 0.8 && rangePct <= 10) {
    const conf = Math.min(0.9, 0.65 + levelsBelow * 0.08);
    return {
      enter: true,
      confidence: conf,
      reason: `📊 DYNAMIC GRID: level -${levelsBelow} (ATR×${multiplier.toFixed(1)}, spacing $${spacing.toFixed(4)}, ${rangePct.toFixed(1)}% range)`,
      pattern: `grid_dyn_${levelsBelow}`,
    };
  }
  return { enter: false, confidence: 0, reason: '', pattern: '' };
}

// Liquidation-map pre-trade check: returns size multiplier (1.0 = full, 0 = skip).
async function checkLiqMap(supabase: any, symbol: string, entryPrice: number, side: 'long' | 'short'): Promise<{ sizeMult: number; tpHint?: number; note: string }> {
  try {
    const { data } = await supabase
      .from('liquidation_map')
      .select('price_level, side, cluster_size_usd')
      .eq('symbol', symbol.toUpperCase())
      .order('cluster_size_usd', { ascending: false })
      .limit(20);
    const rows = (data || []) as Array<{ price_level: number; side: string; cluster_size_usd: number }>;
    if (rows.length === 0) return { sizeMult: 1, note: '' };

    // Opposite-side cluster within 0.5% of entry = magnet risk → halve size or skip
    const oppSide = side === 'long' ? 'short' : 'long';
    const nearOpp = rows.find(r => r.side === oppSide && Math.abs(r.price_level - entryPrice) / entryPrice < 0.005 && r.cluster_size_usd > 100);
    if (nearOpp) return { sizeMult: 0.5, note: `liq-map: opposite cluster $${nearOpp.cluster_size_usd.toFixed(0)} within 0.5% — size halved` };

    // Same-side cluster above (for longs) or below (for shorts) = TP magnet
    const sameAhead = rows.find(r => r.side === side && (side === 'long' ? r.price_level > entryPrice : r.price_level < entryPrice) && Math.abs(r.price_level - entryPrice) / entryPrice < 0.03);
    if (sameAhead) {
      const tpHint = side === 'long' ? sameAhead.price_level * 0.998 : sameAhead.price_level * 1.002;
      return { sizeMult: 1, tpHint, note: `liq-map: same-side magnet at $${sameAhead.price_level} → TP nudge` };
    }
    return { sizeMult: 1, note: '' };
  } catch {
    return { sizeMult: 1, note: '' };
  }
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
      case 'scalp': {
        // PURE SCALP — momentum entry with multi-confirmation gating.
        // Required confirmations before opening:
        //   1) Trend gate: not in a downtrend, 7d trend not bleeding
        //   2) Momentum band: 24h move in the 0.5%–3% sweet spot
        //   3) Volatility band: daily range between 1.5% and 12% of price
        //      (too tight = no profit room / noise; too wide = chop/whipsaw)
        //   4) Range/whipsaw filter: pricePosition in 0.30–0.80
        //      (avoids capitulation bottoms and blow-off tops)
        //   5) Liquidity gate: 24h volume ≥ $250k (Coinbase USDC markets only)
        //   6) Spread gate: reject wide bid/ask spreads when Coinbase exposes them
        if (isInDowntrend) {
          break;
        }
        const m = coin.change24h;
        const ch7d = (coin as any).change7d ?? 0;
        const high24h = coin.high24h ?? coin.price;
        const low24h = coin.low24h ?? coin.price;
        const volPct = coin.price > 0 ? ((high24h - low24h) / coin.price) * 100 : 0;
        const vol24h = coin.volume ?? 0;

        // Scalping rides POSITIVE momentum only — never catch falling knives.
        // Require +0.3%–+5% daily momentum; below that there's nothing to
        // scalp, above that we're chasing a parabolic blow-off.
        const momentumOk = m >= 0.3 && m < 5;
        const trendOk = ch7d >= -3;
        const volatilityOk = volPct >= 1.5 && volPct <= 12;
        // Range band: no capitulation buys near lows, no blow-off-top buys near highs
        const rangeOk = pricePosition >= 0.30 && pricePosition <= 0.80;
        const liquidityOk = vol24h >= 250_000;
        const spreadOk = coin.spreadPercent === undefined || coin.spreadPercent <= 0.8;

        if (!momentumOk) {
          console.log(`🚫 SCALP SKIP ${coin.symbol}: momentum ${m.toFixed(2)}% — need +0.3% to +5% (positive only)`);
          break;
        }
        if (!trendOk || !volatilityOk || !rangeOk || !liquidityOk || !spreadOk) {
          const failed = [
            !trendOk && `trend(7d ${ch7d.toFixed(1)}%)`,
            !volatilityOk && `volatility(${volPct.toFixed(1)}%)`,
            !rangeOk && `range(${(pricePosition * 100).toFixed(0)}%)`,
            !liquidityOk && `liquidity($${(vol24h / 1e6).toFixed(2)}M)`,
            !spreadOk && `spread(${(coin.spreadPercent ?? 0).toFixed(2)}%)`,
          ].filter(Boolean).join(', ');
          console.log(`🚫 SCALP SKIP ${coin.symbol}: failed ${failed}`);
          break;
        }

        action = 'buy';
        // Confidence rewards fresh momentum, mid-range entry, healthy volatility
        const sweetSpot = m >= 1 && pricePosition <= 0.65 && volPct >= 2.5 && volPct <= 8;
        confidence = sweetSpot ? 0.92 : 0.78;
        reason = `⚡ SCALP: +${m.toFixed(2)}% mom | range ${(pricePosition * 100).toFixed(0)}% | vol-band ${volPct.toFixed(1)}% | 7d ${ch7d.toFixed(1)}%`;
        pattern = 'scalp_momentum_confirmed';
        break;
      }


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
        // AGGRESSIVE MOMENTUM - Any positive signal, plus dip-buy entries
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
        } else if (isIn7dUptrend && coin.change24h >= -3) {
          // DIP-BUY: 7d uptrend with intraday pullback — filterByTrend already validated this is a dip candidate
          action = 'buy';
          confidence = 0.78;
          reason = `🔄 DIP-BUY: 7d uptrend with ${coin.change24h.toFixed(2)}% pullback`;
          pattern = 'momentum_dip';
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
        
      case 'grid': {
        // DYNAMIC GRID — ATR-tuned spacing, regime-aware, entries at discrete levels.
        const gd = dynamicGridDecision(coin, regime);
        if (gd.enter) {
          action = 'buy';
          confidence = gd.confidence;
          reason = gd.reason;
          pattern = gd.pattern;
        } else if (pricePosition < 0.35 && (regime === 'ranging' || regime === 'low_volatility')) {
          action = 'buy';
          confidence = 0.72;
          reason = `📊 GRID FALLBACK: Low in range (${(pricePosition * 100).toFixed(0)}%)`;
          pattern = 'grid_low';
        }
        break;
      }

        
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
    
    // Precision-first threshold: rule strategies must clear 0.60 confidence before
    // they're even considered for the unified scoring/sentiment gate downstream.
    if (action !== 'hold' && confidence >= 0.60) {
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

    let openPositionsCount = openPositions || 0;

    // Load user-tunable scalp settings (entry/exit/loss-rotation/sizing knobs)
    const scalpCfg = await loadScalpCfg(supabase, user.id);
    console.log('⚙️ Scalp cfg:', JSON.stringify({
      entry: [scalpCfg.entry_min_5m_pct, scalpCfg.entry_min_1h_pct, scalpCfg.entry_min_24h_pct],
      reentry: scalpCfg.reentry_breakout_pct, chase_min: scalpCfg.chase_guard_minutes,
      loss_rot: { en: scalpCfg.loss_rotation_enabled, max: scalpCfg.loss_rotation_max_loss_pct, edge: scalpCfg.loss_rotation_momentum_edge_pct },
      slots: scalpCfg.max_concurrent_positions, cap_pct: scalpCfg.max_capital_usage_pct,
    }));
    if (openPositionsCount >= settings.max_concurrent_trades) {
      console.log(`⚠️ Slots full (${openPositionsCount}/${settings.max_concurrent_trades}) — will attempt loss-rotation after candidate scan`);
      // Don't early-return; let the deeper check at remainingSlots===0 try loss-rotation.
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
      .select('pnl, ai_reasoning')
      .eq('user_id', user.id)
      .eq('is_paper', isPaperMode)
      .gte('created_at', todayStart.toISOString());

    // Exclude user-initiated manual closures from the daily-loss circuit breaker.
    // Otherwise closing a few red positions can pause the bot for the rest of the day.
    const todaysLoss = (todaysTrades || []).reduce((sum: number, t: any) => {
      const pnl = Number(t.pnl) || 0;
      if (pnl >= 0) return sum;
      const reason = String(t.ai_reasoning || '');
      if (reason.startsWith('Force closed by user')) return sum;
      return sum + pnl;
    }, 0);
    const maxDailyLossAmount = equityBase * ((settings.max_daily_loss || 5) / 100);

    if (Math.abs(todaysLoss) >= maxDailyLossAmount) {
      console.log(`🛑 DAILY LOSS LIMIT HIT: Lost $${Math.abs(todaysLoss).toFixed(2)} (max: $${maxDailyLossAmount.toFixed(2)} on equity $${equityBase.toFixed(2)})`);

      await supabase
        .from('ai_settings')
        .update({ updated_at: new Date().toISOString() })
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

    // 🎯 DAILY PROFIT TARGET — $500/day swept to USDC.
    // Stop opening new positions once realized profit ≥ target; existing positions
    // continue to be managed by auto-take-profit (sells back to USDC on hit).
    const DAILY_PROFIT_TARGET = Number((settings as any).daily_profit_target ?? 500);
    const todaysRealizedProfit = (todaysTrades || []).reduce((sum: number, t: any) => {
      const pnl = Number(t.pnl) || 0;
      return pnl > 0 ? sum + pnl : sum;
    }, 0);
    const todaysNetPnL = (todaysTrades || []).reduce((sum: number, t: any) => sum + (Number(t.pnl) || 0), 0);

    if (todaysNetPnL >= DAILY_PROFIT_TARGET) {
      console.log(`🎯 DAILY PROFIT TARGET HIT: net +$${todaysNetPnL.toFixed(2)} ≥ $${DAILY_PROFIT_TARGET}. Pausing new entries; profits stay in USDC.`);
      return new Response(JSON.stringify({
        message: `Daily profit target $${DAILY_PROFIT_TARGET} reached`,
        todaysNetPnL,
        todaysRealizedProfit,
        target: DAILY_PROFIT_TARGET,
        status: 'profit_target_hit',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.log(`🎯 Daily profit progress: net $${todaysNetPnL.toFixed(2)} / target $${DAILY_PROFIT_TARGET} (${((todaysNetPnL / DAILY_PROFIT_TARGET) * 100).toFixed(1)}%)`);

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

    // Detect market regime (enum value for DB) + richer policy profile (drives behavior)
    const regime = detectMarketRegime(marketData);
    const regimeReport = classifyRegimeProfile(marketData);
    const regimePolicy = getRegimePolicy(regimeReport);
    console.log(`📊 Regime: ${regime} | Profile: ${regimeReport.profile} | avg|5m|=${regimeReport.avg5mAbs.toFixed(2)}% avg|1h|=${regimeReport.avg1hAbs.toFixed(2)}% avg24h=${regimeReport.avg24h.toFixed(2)}% σ24h=${regimeReport.dispersion24h.toFixed(2)}% risers=${(regimeReport.risersShare * 100).toFixed(0)}%`);
    console.log(`🧭 Policy: ${regimePolicy.rationale}`);

    // 🛑 DEAD MARKET STAND-DOWN — Titan learns when to do nothing.
    // Movement is too small to overcome fees; opening positions would bleed capital.
    if (regimePolicy.skipTrading) {
      await supabase.from('ai_settings').update({
        current_regime: regime,
        bot_status: 'idle',
        updated_at: new Date().toISOString(),
      }).eq('user_id', user.id);

      await supabase.from('ai_decisions').insert({
        user_id: user.id,
        decision_type: 'regime_skip',
        reasoning: regimePolicy.rationale,
        market_regime: regime,
      });

      console.log('💤 STAND-DOWN: Dead market — no new entries this cycle');
      return new Response(JSON.stringify({
        status: 'standing_down',
        reason: regimePolicy.rationale,
        regime,
        regimeProfile: regimeReport.profile,
        regimeReport,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }



    // 📈 TREND ANALYSIS - Filter out downtrending coins
    const memeOnly = !!(settings as any).meme_coins_only;
    if (memeOnly) console.log('🐸 MEME-ONLY MODE ENABLED — restricting universe to meme-coin allowlist');
    const { tradeable, trendAnalysis } = await filterByTrend(marketData, scalpCfg, { memeOnly });
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

    // 🧠 TITAN FUSION PRIORITY — multi-signal conviction (Polymarket + news + liquidations + technicals)
    // Re-rank and softly gate tradeable list by latest fusion conviction.
    const fusionMap = new Map<string, { conviction: number; direction: string; drivers: any; rationale: string | null }>();
    try {
      const fusionCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: fusionRows } = await supabase
        .from('titan_fusion_signals')
        .select('symbol, conviction, direction, drivers, rationale, generated_at')
        .gte('generated_at', fusionCutoff)
        .order('generated_at', { ascending: false });

      if (fusionRows && fusionRows.length > 0) {
        // Keep latest per symbol
        for (const row of fusionRows as any[]) {
          const sym = String(row.symbol).toUpperCase();
          if (!fusionMap.has(sym)) {
            fusionMap.set(sym, {
              conviction: Number(row.conviction) || 0,
              direction: String(row.direction || 'neutral').toLowerCase(),
              drivers: row.drivers,
              rationale: row.rationale ?? null,
            });
          }
        }
        console.log(`🧠 Titan Fusion: ${fusionMap.size} fresh signals loaded (≤30m old)`);

        // Soft gate: drop tradeable coins explicitly tagged bearish or conviction < 40 by fusion.
        // Symbols not covered by fusion (e.g. memes) are left untouched.
        const beforeCount = prioritizedTradeable.length;
        prioritizedTradeable = prioritizedTradeable.filter((c) => {
          const f = fusionMap.get(c.symbol.toUpperCase());
          if (!f) return true; // no fusion data → don't block
          if ((f.direction === 'bearish' || f.direction === 'short') && f.conviction >= 70) {
            console.log(`🧠 FUSION VETO (strong bearish): ${c.symbol} — conviction=${f.conviction}`);
            return false;
          }
          if (f.conviction < 25) {
            console.log(`🧠 FUSION VERY WEAK: ${c.symbol} — conviction ${f.conviction} < 25, skipping`);
            return false;
          }
          return true;
        });
        console.log(`🧠 Fusion gate: ${prioritizedTradeable.length}/${beforeCount} survived`);

        // Re-rank: fusion-scored symbols first by conviction desc; unscored keep prior order at the tail.
        prioritizedTradeable = [...prioritizedTradeable].sort((a, b) => {
          const fa = fusionMap.get(a.symbol.toUpperCase());
          const fb = fusionMap.get(b.symbol.toUpperCase());
          const ca = fa?.conviction ?? -1;
          const cb = fb?.conviction ?? -1;
          if (ca !== cb) return cb - ca;
          return 0;
        });

        const topPreview = prioritizedTradeable.slice(0, 8).map((c) => {
          const f = fusionMap.get(c.symbol.toUpperCase());
          return f ? `${c.symbol}(🧠${f.conviction}/${f.direction})` : c.symbol;
        }).join(', ');
        console.log(`🧠 Fusion-ranked top: ${topPreview}`);
      } else {
        console.log('🧠 Titan Fusion: no recent signals available — falling back to base ranking');
      }
    } catch (err) {
      console.warn('🧠 Fusion lookup failed (non-fatal):', err instanceof Error ? err.message : err);
    }

    // 👥 COPY TRADING PRIORITY — boost assets from followed traders
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

    // 🤖 FULL AUTONOMY — AI self-tunes risk params per cycle based on regime, fusion, and today's P&L.
    // User can opt out by setting ai_settings.ai_autonomous_mode = false (defaults to true).
    const autonomous = (settings as any).ai_autonomous_mode !== false;
    let riskTolerance = settings.risk_tolerance || 'moderate';
    let leverage = settings.max_leverage || 3;
    let dynMaxPositionSize = settings.max_position_size || 10;
    let dynMaxConcurrent = settings.max_concurrent_trades || 5;

    if (autonomous) {
      // Highest fusion conviction in pool (if any)
      const topConviction = Math.max(0, ...prioritizedTradeable.map(c => fusionMap.get(c.symbol.toUpperCase())?.conviction ?? 0));
      const profitProgress = todaysNetPnL / Math.max(1, DAILY_PROFIT_TARGET); // 0..1

      // Risk tolerance: bullish regime + high conviction → aggressive; downtrend/volatile → conservative
      if (regime === 'trending' && topConviction >= 65) riskTolerance = 'aggressive';
      else if (regime === 'high_volatility') riskTolerance = 'conservative';
      else if (regime === 'ranging') riskTolerance = 'moderate';

      // De-risk once we're close to the daily target (lock gains rather than chase)
      if (profitProgress >= 0.6) {
        riskTolerance = 'conservative';
        dynMaxPositionSize = Math.min(dynMaxPositionSize, 5);
      }
      // If today is red, throttle hard
      if (todaysNetPnL < 0) {
        riskTolerance = 'conservative';
        dynMaxPositionSize = Math.min(dynMaxPositionSize, 4);
        dynMaxConcurrent = Math.max(2, Math.min(dynMaxConcurrent, 3));
      }

      // Concurrency scales with balance: more capital → more slots (capped by user max)
      const balanceSlots = balance < 200 ? 2 : balance < 1000 ? 4 : balance < 5000 ? 6 : 8;
      dynMaxConcurrent = Math.min(dynMaxConcurrent, balanceSlots);

      // 🧭 REGIME-DRIVEN OVERLAY — adapt to detected market profile
      const sizeBefore = dynMaxPositionSize;
      const slotsBefore = dynMaxConcurrent;
      dynMaxPositionSize = Math.max(1, Math.round(dynMaxPositionSize * regimePolicy.sizeMultiplier));
      dynMaxConcurrent = Math.max(1, Math.round(dynMaxConcurrent * regimePolicy.slotMultiplier));
      console.log(`🧭 Regime overlay (${regimeReport.profile}): size ${sizeBefore}%→${dynMaxPositionSize}% | slots ${slotsBefore}→${dynMaxConcurrent} | strategy=${regimePolicy.strategy}`);

      console.log(`🤖 AUTO-TUNE → risk=${riskTolerance} | posSize=${dynMaxPositionSize}% | slots=${dynMaxConcurrent} | regime=${regime}/${regimeReport.profile} | topConv=${topConviction} | dayPnL=$${todaysNetPnL.toFixed(2)}`);
    }

    const optimalLeverage = calculateOptimalLeverage(leverage, riskTolerance);
    console.log(`🚀 AI Trading: ${optimalLeverage}x leverage, Risk: ${riskTolerance}, Balance: $${balance.toFixed(2)}`);
    let decisions = await analyzeWithAI(prioritizedTradeable, balance, dynMaxPositionSize, trendAnalysis, bestStrategy, regime, optimalLeverage, riskTolerance, fusionMap);

    // 🛡️ LOSS-PROTECTION STAND-DOWN
    // If today is already red AND the regime isn't actively bullish, stop opening new positions.
    // The old cascade (grid → scalp → ema) was forcing trades in choppy/down markets and
    // compounding losses. Existing positions remain managed by auto-take-profit.
    const dayLossPct = balance > 0 ? (todaysNetPnL / balance) * 100 : 0;
    const bullishRegime = regimeReport.profile === 'trending_up';
    const standDownOnLoss = todaysNetPnL < 0 && !bullishRegime && dayLossPct <= -1.0;

    if (standDownOnLoss) {
      console.log(`🛡️ STAND-DOWN: dayPnL=$${todaysNetPnL.toFixed(2)} (${dayLossPct.toFixed(2)}%), regime=${regimeReport.profile}. No new entries until day turns green or regime flips bullish.`);
      decisions = [];
    } else if (decisions.length === 0) {
      // Single, regime-appropriate fallback. No more "always find something" cascade.
      const policyStrategy = regimePolicy.strategy === 'none' ? null : (regimePolicy.strategy === 'grid' ? 'grid' : bestStrategy);
      if (policyStrategy) {
        console.log(`📊 AI returned no decisions, trying rule-based ${policyStrategy} (regime=${regimeReport.profile})`);
        decisions = analyzeWithRules(prioritizedTradeable, regime, dynMaxPositionSize, balance, policyStrategy);
      } else {
        console.log(`📊 Regime policy is stand-down (${regimeReport.profile}). Skipping rule fallback.`);
      }
    }

    // Apply regime-driven confidence floor — in volatile/down-trending regimes we only act on high-conviction setups.
    // Default rule/AI minimum is ~0.6; the policy can raise this to filter weak signals.
    const minConfidenceFloor = 0.6 + regimePolicy.minConfidenceBoost;
    if (regimePolicy.minConfidenceBoost > 0 && decisions.length > 0) {
      const before = decisions.length;
      decisions = decisions.filter(d => (d.confidence ?? 0) >= minConfidenceFloor);
      if (decisions.length < before) {
        console.log(`🧭 Regime confidence filter (≥${minConfidenceFloor.toFixed(2)}): ${decisions.length}/${before} survived`);
      }
    }

    // NOTE: Previously there was a "force a trade" secondary fallback here.
    // Removed in favor of regime-aware behavior — Titan now learns when to stand down
    // (dead markets) rather than manufacturing entries with no edge.



    // 🛡️ LOSS PREVENTION FILTER REMOVED — per user request, no cooldown after losing trades.
    // The bot will retry symbols regardless of recent loss history.

    // Double-check: Filter out any decisions for coins in downtrend (safety net)
    decisions = decisions.filter(d => {
      // Check trend
      const trend = trendAnalysis.find(t => t.symbol === d.symbol);
      if (trend && !trend.shouldTrade) {
        console.log(`🛡️ Safety filter: Blocking ${d.action} on ${d.symbol} - in ${trend.trend}`);
        return false;
      }



      // Final entry safety net: AI and rules are only allowed to buy confirmed risers.
      if (d.action === 'buy') {
        const coin = marketData.find(m => m.symbol === d.symbol);
        if (!coin) return false;
        const momentumStatus = getEntryMomentumStatus(coin, scalpCfg);
        if (!momentumStatus.ok) {
          console.log(`🛡️ Entry safety filter: Blocking ${d.symbol} — needs rising short-window confirmation, got 5m ${momentumStatus.c5?.toFixed(2) ?? 'n/a'}%, 15m ${momentumStatus.c1h.toFixed(2)}%, 24h ${momentumStatus.c24.toFixed(2)}%`);
          return false;
        }
      }
      
      return true;
    });

    // 🔒 STRICT MODE: enforce min of ai_settings.max_concurrent_trades, scalp_settings.max_concurrent_positions, hard cap
    const effectiveMaxTrades = Math.min(
      settings.max_concurrent_trades || SCALP_MAX_CONCURRENT,
      scalpCfg.max_concurrent_positions || SCALP_MAX_CONCURRENT,
      SCALP_MAX_CONCURRENT
    );
    let remainingSlots = Math.max(0, effectiveMaxTrades - openPositionsCount);
    console.log(`📊 Trade slots: ${openPositionsCount} used / ${effectiveMaxTrades} max (strict: ai=${settings.max_concurrent_trades}, scalp=${scalpCfg.max_concurrent_positions}, hard=${SCALP_MAX_CONCURRENT}) = ${remainingSlots} remaining`);


    if (remainingSlots === 0 && tradeable.length > 0) {
      const rotated = await tryLossRotation(supabase, user.id, isPaperMode, marketData, tradeable[0], scalpCfg);
      if (rotated) {
        openPositionsCount = Math.max(0, openPositionsCount - 1);
        remainingSlots = Math.max(0, effectiveMaxTrades - openPositionsCount);
        console.log(`🔁 LOSS-ROTATION freed a slot — now ${remainingSlots} remaining`);
      }
    }

    if (remainingSlots === 0) {
      console.log('⚠️ No remaining trade slots - skipping all new trades');
      return new Response(JSON.stringify({
        status: 'at_limit',
        message: 'Max concurrent trades reached',
        openPositions: openPositionsCount,
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
        const tradeValue = Math.max(availableCapital * (decisionSizePercent / 100) * decision.confidence, 1);
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
            strategy: 'scalp',
            ai_reasoning: decision.reason,
            confidence: decision.confidence,
            market_regime: regime,
            status: 'pending',
            expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
          });
        
        if (!pendingError) {
          // Persist signal score for visibility
          const factors = buildSignalFactors(coinData, regime, decision.confidence, decision.action as 'buy' | 'sell');
          await supabase.from('signal_scores').insert({
            user_id: user.id,
            symbol: decision.symbol,
            strategy: 'scalp',
            action: decision.action,
            reasoning: decision.reason,
            ...factors,
          });

          pendingTrades.push({
            symbol: decision.symbol,
            side: decision.action,
            quantity,
            price: coinData.price,
            value: tradeValue,
            confidence: decision.confidence,
            score: factors.total_score,
          });
          console.log(`📋 Queued: ${decision.action.toUpperCase()} ${quantity.toFixed(6)} ${decision.symbol} @ $${coinData.price.toFixed(2)} (score ${factors.total_score})`);
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
        strategy: 'scalp',
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
    const recentExits = await getRecentExits(supabase, user.id, isPaperMode, scalpCfg.chase_guard_minutes);
    console.log(
      `🧯 Duplicate guard: ${openPositionSymbols.size} open symbol(s), ${lastTradeByKey.size} recent trade key(s) (cooldown ${DUPLICATE_TRADE_COOLDOWN_MINUTES}m), ${recentExits.size} recent exit(s) (chase window ${scalpCfg.chase_guard_minutes}m)`
    );

    // ============================================================
    // 🪙 DUST TOP-UP PHASE
    // When cash has grown (e.g. after taking profits), prefer to top up
    // existing small/dust-prone positions to a healthy size BEFORE opening
    // brand-new positions. This keeps every position sellable and avoids
    // bleed from sub-minimum holdings.
    // ============================================================
    try {
      const DUST_TOPUP_THRESHOLD = Math.max(10, balance * 0.01); // $10 or 1% of cash
      const TOPUP_CASH_RESERVE = Math.max(2, balance * 0.02);    // keep small cash buffer

      const { data: openPositionsForTopup } = await supabase
        .from('positions')
        .select('symbol, quantity, avg_entry_price')
        .eq('user_id', user.id)
        .eq('is_paper', isPaperMode)
        .eq('side', 'buy');

      type TopupCandidate = { symbol: string; price: number; currentValue: number; deficit: number };
      const candidates: TopupCandidate[] = [];

      for (const pos of openPositionsForTopup || []) {
        const symU = String(pos.symbol).toUpperCase();
        const coin = marketData.find(m => String(m.symbol).toUpperCase() === symU);
        const price = Number(coin?.price ?? pos.avg_entry_price);
        if (!price || price <= 0) continue;
        const avgEntry = Number(pos.avg_entry_price || 0);
        const c5 = coin?.change5m;
        const c15 = coin?.change1h ?? 0;
        const c24 = coin?.change24h ?? 0;
        const momentumStatus = coin ? getEntryMomentumStatus(coin, scalpCfg) : { ok: false };
        if (price < avgEntry || !momentumStatus.ok) {
          console.log(`🪙 SKIP dust top-up ${symU}: not averaging down / dropping position (price $${price.toFixed(4)} vs entry $${avgEntry.toFixed(4)}, 5m ${c5?.toFixed(2) ?? 'n/a'}%, 15m ${c15.toFixed(2)}%, 24h ${c24.toFixed(2)}%)`);
          continue;
        }
        const value = Number(pos.quantity) * price;
        if (value > 0 && value < DUST_TOPUP_THRESHOLD) {
          candidates.push({
            symbol: symU,
            price,
            currentValue: value,
            deficit: DUST_TOPUP_THRESHOLD - value,
          });
        }
      }

      // Smallest first so dust gets rescued first
      candidates.sort((a, b) => a.currentValue - b.currentValue);

      let availableForTopup = Math.max(0, balance - TOPUP_CASH_RESERVE);
      const topupDecisions: any[] = [];

      for (const c of candidates) {
        if (availableForTopup < 1) break;
        const spend = Math.min(c.deficit, availableForTopup);
        if (spend < 1) continue; // below exchange minimum
        topupDecisions.push({
          symbol: c.symbol,
          action: 'buy',
          confidence: 1,
          reason: `Dust top-up: bringing ${c.symbol} from $${c.currentValue.toFixed(2)} toward $${DUST_TOPUP_THRESHOLD.toFixed(2)}`,
          pattern: 'dust_topup',
          _topup: true,
          _topupSpend: spend,
        });
        availableForTopup -= spend;
      }

      if (topupDecisions.length > 0) {
        console.log(`🪙 DUST TOP-UP: queued ${topupDecisions.length} top-up(s), threshold=$${DUST_TOPUP_THRESHOLD.toFixed(2)}`);
        // Run top-ups first so small positions are rescued before new entries
        (limitedDecisions as any[]).unshift(...topupDecisions);
      }
    } catch (e) {
      console.error('Dust top-up phase failed (non-fatal):', e);
    }

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

      if (side === 'buy' && openPositionSymbols.has(symbolUpper) && !(decision as any)._topup) {
        console.log(`🧯 SKIP duplicate BUY: already holding ${symbolUpper}`);
        continue;
      }

      if (lastAt && Date.now() - lastAt < DUPLICATE_TRADE_COOLDOWN_MINUTES * 60 * 1000 && !(decision as any)._topup) {
        const minsAgo = (Date.now() - lastAt) / (1000 * 60);
        console.log(
          `🧯 SKIP duplicate ${side.toUpperCase()} ${symbolUpper}: last ${minsAgo.toFixed(1)}m ago (cooldown ${DUPLICATE_TRADE_COOLDOWN_MINUTES}m)`
        );
        continue;
      }

      // 🛡️ PRICE-FEED CONFIRMATION GUARD
      // Refuse to open BUY on symbols whose live price feed can't be confirmed.
      // Requires a Coinbase productId (proves the symbol is tradable AND will be
      // monitored by auto-take-profit / hard-stop). Blind positions = unmonitored = catastrophic loss.
      if (side === 'buy' && !(decision as any)._topup) {
        if (!coinData.productId || !(Number(coinData.price) > 0)) {
          console.log(`🛡️ SKIP ${symbolUpper}: no confirmed Coinbase price feed (productId=${coinData.productId ?? 'none'}, price=${coinData.price}). Refusing blind entry.`);
          try {
            await supabaseClient.from('risk_events').insert({
              user_id: userId,
              event_type: 'price_feed_guard',
              severity: 'warning',
              message: `Blocked BUY ${symbolUpper}: no confirmed Coinbase price feed`,
              details: { symbol: symbolUpper, productId: coinData.productId ?? null, price: coinData.price ?? null },
            });
          } catch (_) { /* non-fatal */ }
          continue;
        }
      }


      // 🧯 CHASE GUARD: skip if we just exited this symbol at a similar price
      if (side === 'buy' && !(decision as any)._topup) {
        const lastExit = recentExits.get(symbolUpper);
        if (lastExit && lastExit.exitPrice > 0) {
          const currPrice = coinData.price;
          const priceDeltaPct = ((currPrice - lastExit.exitPrice) / lastExit.exitPrice) * 100;
          if (priceDeltaPct <= scalpCfg.reentry_breakout_pct) {
            const minsAgo = (Date.now() - lastExit.closedAt) / (1000 * 60);
            console.log(
              `🧯 SKIP rebuy ${symbolUpper}: exited $${lastExit.exitPrice.toFixed(4)} ${minsAgo.toFixed(1)}m ago, now $${currPrice.toFixed(4)} (${priceDeltaPct.toFixed(2)}%). Need +${scalpCfg.reentry_breakout_pct}% above exit before re-entry`
            );
            continue;
          }
        }
      }

      // Last-moment live momentum confirmation before sizing/risk/execution.
      if (side === 'buy') {
        const freshMomentum = coinData.productId ? await fetchShortWindowMomentum(coinData.productId) : null;
        const liveMomentumCoin = {
          ...coinData,
          change5m: freshMomentum?.change5m ?? coinData.change5m,
          change1h: freshMomentum?.change15m ?? coinData.change1h ?? 0,
        };
        const momentumStatus = getEntryMomentumStatus(liveMomentumCoin, scalpCfg);
        if (!momentumStatus.ok) {
          console.log(`🛑 FINAL BUY BLOCK ${symbolUpper}: price is not rising enough now (5m ${momentumStatus.c5?.toFixed(2) ?? 'n/a'}%, 15m ${momentumStatus.c1h.toFixed(2)}%, 24h ${momentumStatus.c24.toFixed(2)}%)`);
          continue;
        }
        coinData.change5m = momentumStatus.c5;
        coinData.change1h = momentumStatus.c1h;
      }

      // 🔒 STRICT MODE — ignore AI-suggested overrides; obey scalp_settings + ai_settings exactly.
      const MIN_TRADE_VALUE = 1.00;
      const userMaxLeverage = Number(settings.max_leverage || 1);
      // Hard-clamp AI's request to user's max, then scale down by regime + volatility.
      const aiRequestedLev = Math.max(1, Math.min(
        Number((decision as any).leverage || optimalLeverage || 1),
        userMaxLeverage
      ));
      const _coinForLev = (decision as any)._coinData || coinData;
      const _rangePct = _coinForLev && _coinForLev.high24h && _coinForLev.low24h && _coinForLev.price
        ? ((_coinForLev.high24h - _coinForLev.low24h) / _coinForLev.price) * 100
        : 4;
      const _effLev = computeEffectiveLeverage(aiRequestedLev, regime, _rangePct);
      const decisionLeverage = _effLev.leverage;
      if (decisionLeverage < aiRequestedLev) {
        console.log(`⚖️ Effective leverage scaled: ${aiRequestedLev}x → ${decisionLeverage}x (${_effLev.reason})`);
      }
      const maxCapitalUsage = Number(settings.max_capital_usage || 80);
      const maxPositionSize = Number(settings.max_position_size || 10);
      const availableCapital = balance * (maxCapitalUsage / 100);

      // Dynamic sizing: use AI-suggested size within maxPositionSize cap.
      // target_position_size_usd is intentionally ignored — no fixed dollar target.
      const aiSuggestedValue = availableCapital * (Math.min(maxPositionSize, Number((decision as any).size_percent || maxPositionSize)) / 100);
      const baseValue = Math.min(aiSuggestedValue, availableCapital);
      const leveragedNotional = baseValue * decisionLeverage;

      // Actual capital used — strict: NEVER exceeds baseValue (no confidence multiplier upward).
      let tradeValue = (decision as any)._topup
        ? Math.max((decision as any)._topupSpend || MIN_TRADE_VALUE, MIN_TRADE_VALUE)
        : Math.max(Math.min(baseValue, availableCapital), MIN_TRADE_VALUE);

      // 🔥 LIQUIDATION-MAP pre-trade check (best-effort, never blocks on error)
      try {
        const _entrySide: 'long' | 'short' = (decision.action === 'sell') ? 'short' : 'long';
        const _liq = await checkLiqMap(supabase, decision.symbol, coinData.price, _entrySide);
        if (_liq.sizeMult < 1) {
          console.log(`🔥 ${_liq.note}`);
          tradeValue = Math.max(tradeValue * _liq.sizeMult, MIN_TRADE_VALUE);
        }
        if (_liq.tpHint) {
          (decision as any)._tpHint = _liq.tpHint;
          console.log(`🔥 ${_liq.note}`);
        }
      } catch { /* non-fatal */ }




      // 🛡️ HARD SCALP CAP: each new scalp ≤ SCALP_MAX_POSITION_PCT of equity
      // (skip for top-ups, which intentionally add to existing positions)
      if (!(decision as any)._topup) {
        // Pull current open positions value for equity calc
        const { data: _capPositions } = await supabase
          .from('positions')
          .select('quantity, avg_entry_price')
          .eq('user_id', user.id)
          .eq('is_paper', isPaperMode);
        const _openVal = (_capPositions || []).reduce(
          (s: number, p: any) => s + Number(p.quantity) * Number(p.avg_entry_price), 0
        );
        const equity = balance + _openVal;
        const equityCap = equity * (SCALP_MAX_POSITION_PCT / 100);
        if (tradeValue > equityCap) {
          console.log(`🛡️ Scalp cap: clamping ${symbolUpper} $${tradeValue.toFixed(2)} → $${equityCap.toFixed(2)} (${SCALP_MAX_POSITION_PCT}% of $${equity.toFixed(0)} equity)`);
          tradeValue = Math.max(equityCap, MIN_TRADE_VALUE);
        }
      }

      let quantity = tradeValue / coinData.price;
      let actualEntryPrice = coinData.price;
      
      console.log(`⚙️ Using YOUR settings: maxCapital=${maxCapitalUsage}%, maxPosition=${maxPositionSize}%, maxTrades=${settings.max_concurrent_trades} (scalp cap ${SCALP_MAX_CONCURRENT}, per-pos ${SCALP_MAX_POSITION_PCT}%)`);
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
      const baseIncrement = Number(coinData.baseIncrement || '0.00000001') || 0.00000001;
      const preRoundedQty = Math.floor(quantity / baseIncrement) * baseIncrement;
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
      
      // 🔒 STRICT STOP-LOSS: use scalp_settings.hard_stop_loss_pct exactly (not the 1%-risk-budget calc).
      // AI cannot widen the stop. Fallback to 2% only if config missing.
      const strictHardStopPct = Number(scalpCfg.hard_stop_loss_pct || 2);
      const maxStopDistancePct = Math.max(0.0025, strictHardStopPct / 100);

      const defaultStopLoss = decision.action === 'buy'
        ? actualEntryPrice * (1 - maxStopDistancePct)
        : undefined;
      
      // currentEquity = cash + value of open positions (NOT cash alone),
      // otherwise risk-manager computes availableCash = equity − positionsValue → negative.
      const currentEquityForRisk = balance + openPositionsValue;

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
        currentEquityForRisk,
        openPositionsCount,
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
          const coinbaseSymbol = coinData.productId ? `${coinData.productId}|${coinData.baseIncrement || '0.00000001'}` : decision.symbol;
          const buyResult = await executeCoinbaseBuy(coinbaseSymbol, tradeValue, coinData.price);
          
          if (buyResult.success && buyResult.quantity && buyResult.price) {
            quantity = buyResult.quantity;
            actualEntryPrice = buyResult.price;
            
            // DUST PREVENTION: Verify the quantity we received is sellable using Coinbase's market increment.
            const baseIncrement = Number(coinData.baseIncrement || '0.00000001') || 0.00000001;
            const roundedQty = Math.floor(quantity / baseIncrement) * baseIncrement;
            const positionValue = roundedQty * actualEntryPrice;
            
            if (roundedQty <= 0 || positionValue < MIN_TRADE_VALUE) {
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
      const strategyType = 'scalp'; // Force all autonomous trades to scalp strategy

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

      // Compute and persist 0-100 signal score
      const factors = buildSignalFactors(coinData, regime, decision.confidence, decision.action as 'buy' | 'sell');
      await supabase.from('signal_scores').insert({
        user_id: user.id,
        symbol: decision.symbol,
        strategy: strategyType,
        action: decision.action,
        reasoning: decision.reason,
        ...factors,
      });

      // Log AI decision with score + factor breakdown
      await supabase.from('ai_decisions').insert({
        user_id: user.id,
        decision_type: 'ai_trade_execution',
        symbol: decision.symbol,
        action: decision.action,
        reasoning: `${decision.reason} | Pattern: ${decision.pattern || 'N/A'} | Confidence: ${(decision.confidence * 100).toFixed(0)}% | Score: ${factors.total_score}`,
        market_regime: regime,
        strategy: strategyType,
        score: factors.total_score,
        risk_reward: factors.risk_reward,
        valid: factors.valid,
        factor_scores: factors,
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

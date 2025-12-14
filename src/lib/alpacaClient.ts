/**
 * =============================================================================
 * ALPACA BROKER INTEGRATION CLIENT
 * =============================================================================
 * 
 * PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
 * PATENT REFERENCE: No Custody of User Funds (Patent Claim 5)
 * 
 * This module provides integration with Alpaca Markets for US equity trading.
 * Alpaca is a commission-free stock trading API that supports:
 * - US Equities (NYSE, NASDAQ)
 * - Fractional shares
 * - Extended hours trading
 * - Paper trading for testing
 * 
 * The platform never holds custody of user funds - all trading occurs through
 * user-owned Alpaca brokerage accounts via secure API connections.
 * 
 * =============================================================================
 */

import { getMarketSession, canTradeStocks } from './stockMarketHours';

export interface AlpacaAccount {
  id: string;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
  currency: string;
  cash: number;
  portfolioValue: number;
  buyingPower: number;
  equity: number;
  daytradeCount: number;
  patternDayTrader: boolean;
}

export interface AlpacaPosition {
  assetId: string;
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  currentPrice: number;
  side: 'long' | 'short';
}

export interface AlpacaOrder {
  id: string;
  clientOrderId: string;
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  status: 'new' | 'filled' | 'partially_filled' | 'canceled' | 'rejected';
  filledQty?: number;
  filledAvgPrice?: number;
  submittedAt: string;
  filledAt?: string;
}

export interface AlpacaQuote {
  symbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  lastPrice: number;
  lastSize: number;
  volume: number;
}

export interface AlpacaBar {
  symbol: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

/**
 * Stock trading constraints (SEC regulations)
 */
export const STOCK_TRADING_RULES = {
  // Pattern Day Trader rules
  PDT_EQUITY_MINIMUM: 25000, // $25k minimum for day trading
  PDT_TRADE_LIMIT: 3,        // Max 3 day trades per 5 days without PDT status
  
  // Lot sizes and precision
  MIN_SHARE_QTY: 0.01,       // Fractional shares supported (1 cent minimum)
  MAX_SHARES_PER_ORDER: 10000000, // 10M shares max per order
  
  // Order value limits
  MIN_ORDER_VALUE: 1.00,     // $1 minimum order
  MAX_ORDER_VALUE: 1000000,  // $1M max per order for most stocks
  
  // Extended hours constraints
  EXTENDED_HOURS_LIMIT_ONLY: true, // Only limit orders in extended hours
  
  // Settlement
  SETTLEMENT_DAYS: 2,        // T+2 settlement for stocks (T+1 effective May 2024)
};

/**
 * Popular US stock symbols for scanning
 * Organized by sector/category for asset-aware analysis
 */
export const US_STOCK_UNIVERSE = {
  // Mega-cap tech
  tech: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'AMD', 'INTC'],
  
  // Financial sector
  finance: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'V', 'MA', 'PYPL', 'SQ'],
  
  // Healthcare
  healthcare: ['JNJ', 'UNH', 'PFE', 'MRK', 'ABBV', 'TMO', 'DHR', 'BMY', 'LLY', 'AMGN'],
  
  // Consumer
  consumer: ['WMT', 'PG', 'KO', 'PEP', 'COST', 'MCD', 'NKE', 'SBUX', 'TGT', 'HD'],
  
  // Energy
  energy: ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'OXY', 'MPC', 'VLO', 'PSX', 'KMI'],
  
  // Industrial
  industrial: ['CAT', 'DE', 'BA', 'HON', 'UPS', 'RTX', 'LMT', 'GE', 'MMM', 'UNP'],
  
  // ETFs (index tracking)
  etfs: ['SPY', 'QQQ', 'IWM', 'DIA', 'VTI', 'VOO', 'XLF', 'XLK', 'XLE', 'XLV'],
  
  // Volatility/hedging
  volatility: ['VXX', 'UVXY', 'SQQQ', 'TQQQ', 'SPXU', 'SPXL', 'TZA', 'TNA'],
};

/**
 * Get all tradeable stock symbols
 */
export function getAllStockSymbols(): string[] {
  return Object.values(US_STOCK_UNIVERSE).flat();
}

/**
 * Get stock symbols by sector
 */
export function getStocksBySector(sector: keyof typeof US_STOCK_UNIVERSE): string[] {
  return US_STOCK_UNIVERSE[sector] || [];
}

/**
 * Check if PDT rules apply (for accounts under $25k)
 */
export function checkPDTRestrictions(
  accountEquity: number,
  dayTradesLast5Days: number
): { restricted: boolean; tradesRemaining: number; message: string } {
  if (accountEquity >= STOCK_TRADING_RULES.PDT_EQUITY_MINIMUM) {
    return {
      restricted: false,
      tradesRemaining: Infinity,
      message: 'PDT rules do not apply (equity >= $25k)',
    };
  }
  
  const tradesRemaining = Math.max(0, STOCK_TRADING_RULES.PDT_TRADE_LIMIT - dayTradesLast5Days);
  
  return {
    restricted: tradesRemaining === 0,
    tradesRemaining,
    message: tradesRemaining === 0
      ? 'PDT limit reached. No day trades allowed for 5 trading days.'
      : `${tradesRemaining} day trades remaining before PDT restriction.`,
  };
}

/**
 * Calculate order size respecting stock trading rules
 */
export function calculateStockOrderSize(
  accountEquity: number,
  maxPositionPercent: number,
  stockPrice: number,
  allowFractional: boolean = true
): { shares: number; value: number; valid: boolean; reason: string } {
  const maxPositionValue = accountEquity * (maxPositionPercent / 100);
  let shares = maxPositionValue / stockPrice;
  
  // Apply fractional rules
  if (!allowFractional) {
    shares = Math.floor(shares);
  } else {
    // Round to 2 decimal places for fractional
    shares = Math.floor(shares * 100) / 100;
  }
  
  const value = shares * stockPrice;
  
  // Validate against rules
  if (value < STOCK_TRADING_RULES.MIN_ORDER_VALUE) {
    return {
      shares: 0,
      value: 0,
      valid: false,
      reason: `Order value ($${value.toFixed(2)}) below minimum ($${STOCK_TRADING_RULES.MIN_ORDER_VALUE})`,
    };
  }
  
  if (shares < STOCK_TRADING_RULES.MIN_SHARE_QTY) {
    return {
      shares: 0,
      value: 0,
      valid: false,
      reason: `Share quantity (${shares}) below minimum (${STOCK_TRADING_RULES.MIN_SHARE_QTY})`,
    };
  }
  
  return {
    shares,
    value,
    valid: true,
    reason: 'Order valid',
  };
}

/**
 * Determine if extended hours order is allowed
 */
export function canPlaceExtendedHoursOrder(
  orderType: 'market' | 'limit'
): { allowed: boolean; reason: string } {
  const session = getMarketSession();
  
  if (session.session === 'regular') {
    return { allowed: true, reason: 'Regular trading hours - all order types allowed' };
  }
  
  if (session.session === 'pre-market' || session.session === 'after-hours') {
    if (orderType === 'market') {
      return {
        allowed: false,
        reason: 'Market orders not allowed during extended hours. Use limit orders.',
      };
    }
    return { allowed: true, reason: 'Limit orders allowed during extended hours' };
  }
  
  return { allowed: false, reason: 'Market is closed' };
}

/**
 * Get stock-specific risk parameters
 * 
 * PATENT REFERENCE: Asset-Aware Intelligence (Patent Claim 2)
 * Stocks have different risk characteristics than crypto
 */
export function getStockRiskParams(symbol: string): {
  volatilityClass: 'low' | 'medium' | 'high';
  suggestedStopLoss: number;
  suggestedTakeProfit: number;
  leverageAllowed: boolean;
} {
  // Volatility ETFs and leveraged products
  if (US_STOCK_UNIVERSE.volatility.includes(symbol)) {
    return {
      volatilityClass: 'high',
      suggestedStopLoss: 5,       // 5% stop loss for volatile products
      suggestedTakeProfit: 10,   // 10% take profit target
      leverageAllowed: false,    // Already leveraged products
    };
  }
  
  // ETFs are generally lower volatility
  if (US_STOCK_UNIVERSE.etfs.includes(symbol)) {
    return {
      volatilityClass: 'low',
      suggestedStopLoss: 2,      // 2% stop loss
      suggestedTakeProfit: 4,    // 4% take profit
      leverageAllowed: true,
    };
  }
  
  // Default for individual stocks
  return {
    volatilityClass: 'medium',
    suggestedStopLoss: 3,       // 3% stop loss
    suggestedTakeProfit: 6,     // 6% take profit
    leverageAllowed: true,
  };
}

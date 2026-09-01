/**
 * =============================================================================
 * TITAN AI TRADING PLATFORM - Core Type Definitions
 * =============================================================================
 * 
 * PATENT REFERENCE: USPTO Provisional Application - "AUTOMATED MULTI-ASSET 
 * TRADING PLATFORM WITH ADAPTIVE INTELLIGENCE AND CAPITAL PRESERVATION"
 * 
 * ARCHITECTURE OVERVIEW:
 * This file defines the core data structures for TitanAI's intelligent trading
 * system. The platform is designed with multi-asset class support in mind:
 * 
 * ASSET CLASS:
 * - crypto: Cryptocurrency digital assets (the only supported asset class)
 * 
 * The architecture abstracts asset-specific logic to enable seamless addition
 * of new asset classes without core system modifications. Each asset class
 * can have its own:
 * - Market data providers and price feeds
 * - Exchange/broker integrations
 * - Trading rules and precision requirements
 * - Risk parameters and position limits
 * 
 * ASSET-AWARE INTELLIGENCE (Patent Claim 2):
 * Crypto-specific trading logic: 24/7 markets, high volatility strategies,
 * and satoshi-level precision.
 * 
 * =============================================================================
 */

/**
 * Trade Record
 * 
 * Represents a single trade execution in the system.
 * Supports multi-asset trading with asset-agnostic structure.
 */
export interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  status: 'open' | 'closed';
  pnl?: number;
  pnlPercent?: number;
  strategy: string;
  openedAt: Date;
  closedAt?: Date;
  aiReason?: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  strategy: string;
  openedAt: Date;
}

export interface EquityPoint {
  timestamp: Date;
  equity: number;
  pnl: number;
}

export type MarketRegime = 'trending' | 'ranging' | 'high_volatility' | 'low_volatility' | 'news_driven';

export type BotStatus = 'idle' | 'learning' | 'trading' | 'paused' | 'error';

export type SafetyStatus = 'green' | 'yellow' | 'red';

export interface Strategy {
  id: string;
  name: string;
  type: 'rsi' | 'ema_crossover' | 'macd' | 'trend_breakout' | 'volatility_breakout' | 'grid' | 'dca' | 'custom';
  description: string;
  isActive: boolean;
  params: Record<string, number | string | boolean>;
  performance?: {
    winRate: number;
    totalTrades: number;
    profit: number;
    drawdown?: number;
    sharpeRatio?: number;
  };
  regimeScores?: Record<MarketRegime, number>;
}

/**
 * Risk Settings Configuration
 * 
 * PATENT REFERENCE: Capital Preservation Controls (Patent Claim 4)
 * 
 * User-configurable risk parameters that serve as HARD CONSTRAINTS.
 * The AI trading engine MUST obey these limits - they function as
 * inviolable guardrails, not suggestions.
 * 
 */
export interface RiskSettings {
  /** Maximum % of portfolio for any single position */
  maxPositionSize: number;
  /** Maximum % daily loss before trading is paused */
  maxDailyLoss: number;
  /** Maximum simultaneous open positions */
  maxOpenTrades: number;
  /** Asset classes permitted for trading (crypto only) */
  allowedMarkets: 'crypto'[];
  /** Maximum % of total capital AI can deploy */
  maxCapitalPercent: number;
}

/**
 * AI Trader State
 * 
 * PATENT REFERENCE: Autonomous Operation with Intelligent Oversight (Patent Claim 3)
 * 
 * Tracks the current state of the AI trading engine. The system operates
 * with adaptive intelligence, continuously analyzing market conditions
 * and adjusting strategy selection.
 * 
 * KEY PATENT CLAIMS IMPLEMENTED:
 * - marketRegime: Adaptive market condition detection
 * - safetyStatus: Real-time risk monitoring (Safety Governor)
 * - capitalAllocation: Dynamic multi-strategy capital distribution
 */
export interface AITraderState {
  isEnabled: boolean;
  status: BotStatus;
  lastAnalysis?: Date;
  currentStrategy?: string;
  reason?: string;
  marketRegime: MarketRegime;
  safetyStatus: SafetyStatus;
  capitalAllocation: Record<string, number>;
}

export interface LearningState {
  isLearning: boolean;
  currentPhase: 'idle' | 'backtesting' | 'analyzing' | 'optimizing' | 'complete';
  progress: number;
  lastUpdate: Date;
  bestStrategy: string;
  bestParams: Record<string, number | string>;
  regimePerformance: Record<MarketRegime, { strategy: string; score: number }>;
  totalBacktests: number;
  improvementPercent: number;
}

/**
 * Safety Governor Module
 * 
 * PATENT REFERENCE: Capital Preservation Controls (Patent Claim 4)
 * 
 * The Safety Governor is a MANDATORY system component that automatically
 * pauses trading when risk thresholds are exceeded. This implements the
 * patent's "fail-safe" design principle - when uncertain, the system
 * protects capital by halting operations.
 * 
 * KILL SWITCH FUNCTIONALITY:
 * The system includes an automatic kill switch that activates when:
 * - Daily loss limit is exceeded
 * - Maximum drawdown threshold is breached
 * - API connections fail
 * - Market volatility exceeds safe thresholds
 */
export interface SafetyGovernor {
  dailyLossUsed: number;
  dailyLossLimit: number;
  currentDrawdown: number;
  maxDrawdownLimit: number;
  isApiConnected: boolean;
  volatilityLevel: 'normal' | 'elevated' | 'extreme';
  tradingAllowed: boolean;
  pauseReasons: string[];
}

/**
 * API Key / Broker Connection
 * 
 * PATENT REFERENCE: No Custody of User Funds (Patent Claim 5)
 * 
 * TitanAI never holds custody of user funds. Users deposit real money
 * directly to their connected broker accounts, and TitanAI syncs account
 * balances via broker APIs. This architecture ensures users retain full
 * control and custody of their funds at all times.
 * 
 * BROKER SUPPORT:
 * - coinbase: Cryptocurrency trading (global)
 * - Future: additional crypto exchanges
 */
export interface ApiKey {
  id: string;
  /** Broker/exchange provider identifier */
  provider: 'coinbase';
  name: string;
  isConnected: boolean;
  lastTested?: Date;
}

export interface PortfolioStats {
  totalBalance: number;
  availableCash: number;
  equity: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  weeklyPnl: number;
  weeklyPnlPercent: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  todayTrades: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
}

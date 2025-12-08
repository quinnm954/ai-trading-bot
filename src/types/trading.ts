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

export interface RiskSettings {
  maxPositionSize: number;
  maxDailyLoss: number;
  maxOpenTrades: number;
  allowedMarkets: ('stocks' | 'crypto')[];
  maxCapitalPercent: number;
}

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

export interface ApiKey {
  id: string;
  provider: 'alpaca' | 'coinbase';
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

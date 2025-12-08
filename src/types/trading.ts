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

export interface Strategy {
  id: string;
  name: string;
  type: 'rsi' | 'ema_crossover' | 'grid' | 'dca' | 'custom';
  description: string;
  isActive: boolean;
  params: Record<string, number | string | boolean>;
  performance?: {
    winRate: number;
    totalTrades: number;
    profit: number;
  };
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
  status: 'idle' | 'analyzing' | 'trading' | 'paused';
  lastAnalysis?: Date;
  currentStrategy?: string;
  reason?: string;
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

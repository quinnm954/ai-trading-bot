import type { 
  Trade, 
  Position, 
  EquityPoint, 
  Strategy, 
  PortfolioStats, 
  MarketData,
  RiskSettings,
  AITraderState 
} from '@/types/trading';

export const mockPortfolioStats: PortfolioStats = {
  totalBalance: 125847.32,
  availableCash: 45320.18,
  equity: 80527.14,
  dailyPnl: 2341.56,
  dailyPnlPercent: 1.89,
  weeklyPnl: 8234.21,
  weeklyPnlPercent: 7.02,
  totalPnl: 25847.32,
  totalPnlPercent: 25.85,
  openPositions: 5,
  todayTrades: 12,
};

export const mockPositions: Position[] = [
  {
    id: '1',
    symbol: 'AAPL',
    side: 'long',
    quantity: 50,
    entryPrice: 178.25,
    currentPrice: 185.42,
    pnl: 358.50,
    pnlPercent: 4.02,
    strategy: 'EMA Crossover',
    openedAt: new Date('2024-01-15T09:30:00'),
  },
  {
    id: '2',
    symbol: 'BTC-USD',
    side: 'long',
    quantity: 0.5,
    entryPrice: 42150.00,
    currentPrice: 43850.00,
    pnl: 850.00,
    pnlPercent: 4.03,
    strategy: 'Grid Bot',
    openedAt: new Date('2024-01-14T14:20:00'),
  },
  {
    id: '3',
    symbol: 'NVDA',
    side: 'long',
    quantity: 25,
    entryPrice: 545.80,
    currentPrice: 558.20,
    pnl: 310.00,
    pnlPercent: 2.27,
    strategy: 'RSI Strategy',
    openedAt: new Date('2024-01-16T10:15:00'),
  },
  {
    id: '4',
    symbol: 'ETH-USD',
    side: 'long',
    quantity: 2.5,
    entryPrice: 2280.00,
    currentPrice: 2245.00,
    pnl: -87.50,
    pnlPercent: -1.54,
    strategy: 'DCA Bot',
    openedAt: new Date('2024-01-12T08:00:00'),
  },
  {
    id: '5',
    symbol: 'TSLA',
    side: 'long',
    quantity: 15,
    entryPrice: 238.45,
    currentPrice: 245.80,
    pnl: 110.25,
    pnlPercent: 3.08,
    strategy: 'AI Auto-Trader',
    openedAt: new Date('2024-01-16T11:30:00'),
  },
];

export const mockTrades: Trade[] = [
  {
    id: '1',
    symbol: 'MSFT',
    side: 'buy',
    quantity: 30,
    entryPrice: 378.50,
    exitPrice: 392.15,
    status: 'closed',
    pnl: 409.50,
    pnlPercent: 3.61,
    strategy: 'EMA Crossover',
    openedAt: new Date('2024-01-10T09:30:00'),
    closedAt: new Date('2024-01-12T15:45:00'),
    aiReason: 'Strong upward momentum detected. Golden cross formed on 15m chart.',
  },
  {
    id: '2',
    symbol: 'SOL-USD',
    side: 'buy',
    quantity: 20,
    entryPrice: 98.50,
    exitPrice: 105.20,
    status: 'closed',
    pnl: 134.00,
    pnlPercent: 6.80,
    strategy: 'Grid Bot',
    openedAt: new Date('2024-01-11T12:00:00'),
    closedAt: new Date('2024-01-13T18:30:00'),
  },
  {
    id: '3',
    symbol: 'AMD',
    side: 'buy',
    quantity: 40,
    entryPrice: 145.20,
    exitPrice: 141.80,
    status: 'closed',
    pnl: -136.00,
    pnlPercent: -2.34,
    strategy: 'RSI Strategy',
    openedAt: new Date('2024-01-14T10:00:00'),
    closedAt: new Date('2024-01-14T14:30:00'),
    aiReason: 'RSI oversold signal. Market conditions deteriorated unexpectedly.',
  },
  {
    id: '4',
    symbol: 'GOOGL',
    side: 'buy',
    quantity: 20,
    entryPrice: 142.30,
    exitPrice: 148.75,
    status: 'closed',
    pnl: 129.00,
    pnlPercent: 4.53,
    strategy: 'AI Auto-Trader',
    openedAt: new Date('2024-01-15T09:30:00'),
    closedAt: new Date('2024-01-16T10:00:00'),
    aiReason: 'AI detected strong buying pressure and positive sentiment after earnings.',
  },
];

export const mockEquityData: EquityPoint[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const baseEquity = 100000;
  const randomGrowth = Math.random() * 0.03 - 0.01;
  const cumulativeGrowth = 1 + (i / 30) * 0.25 + (Math.random() * 0.05);
  return {
    timestamp: date,
    equity: baseEquity * cumulativeGrowth,
    pnl: baseEquity * cumulativeGrowth - baseEquity,
  };
});

export const mockStrategies: Strategy[] = [
  {
    id: '1',
    name: 'RSI Strategy',
    type: 'rsi',
    description: 'Buy when RSI < 30 (oversold), sell when RSI > 70 (overbought)',
    isActive: true,
    params: {
      rsiPeriod: 14,
      oversoldThreshold: 30,
      overboughtThreshold: 70,
      positionSize: 5,
      stopLoss: 2,
      takeProfit: 4,
    },
    performance: {
      winRate: 62.5,
      totalTrades: 48,
      profit: 3240.50,
    },
  },
  {
    id: '2',
    name: 'EMA Crossover',
    type: 'ema_crossover',
    description: 'Golden cross (fast EMA crosses above slow EMA) for buy, death cross for sell',
    isActive: true,
    params: {
      fastPeriod: 12,
      slowPeriod: 26,
      positionSize: 8,
      stopLoss: 3,
      takeProfit: 6,
    },
    performance: {
      winRate: 58.3,
      totalTrades: 36,
      profit: 5120.75,
    },
  },
  {
    id: '3',
    name: 'Grid Bot',
    type: 'grid',
    description: 'Place buy/sell orders at regular intervals to profit from volatility',
    isActive: true,
    params: {
      gridLevels: 10,
      gridSpacing: 1.5,
      orderSize: 0.1,
      upperLimit: 50000,
      lowerLimit: 40000,
    },
    performance: {
      winRate: 75.8,
      totalTrades: 124,
      profit: 4850.20,
    },
  },
  {
    id: '4',
    name: 'DCA Bot',
    type: 'dca',
    description: 'Dollar-cost average into positions over time',
    isActive: false,
    params: {
      investmentAmount: 500,
      frequency: 'daily',
      maxPositions: 5,
    },
    performance: {
      winRate: 68.2,
      totalTrades: 22,
      profit: 1580.30,
    },
  },
];

export const mockMarketData: MarketData[] = [
  { symbol: 'AAPL', price: 185.42, change: 2.35, changePercent: 1.28, high: 186.50, low: 182.10, volume: 52340000 },
  { symbol: 'NVDA', price: 558.20, change: 12.40, changePercent: 2.27, high: 562.00, low: 545.00, volume: 48120000 },
  { symbol: 'BTC-USD', price: 43850.00, change: 1250.00, changePercent: 2.93, high: 44200.00, low: 42100.00, volume: 28500000000 },
  { symbol: 'ETH-USD', price: 2245.00, change: -35.00, changePercent: -1.54, high: 2310.00, low: 2220.00, volume: 12400000000 },
  { symbol: 'TSLA', price: 245.80, change: 7.35, changePercent: 3.08, high: 248.50, low: 236.20, volume: 98500000 },
];

export const mockRiskSettings: RiskSettings = {
  maxPositionSize: 10,
  maxDailyLoss: 5,
  maxOpenTrades: 10,
  allowedMarkets: ['stocks', 'crypto'],
  maxCapitalPercent: 80,
};

export const mockAITraderState: AITraderState = {
  isEnabled: true,
  status: 'analyzing',
  lastAnalysis: new Date(),
  currentStrategy: 'EMA Crossover',
  reason: 'Market showing strong bullish momentum. Allocating to trend-following strategies.',
};

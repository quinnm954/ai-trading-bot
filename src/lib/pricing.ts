/**
 * Single source of truth for TitanAI pricing.
 * One plan, one price. Change it here and the whole app follows.
 */

export const MONTHLY_PRICE_USD = 29;

export const PLAN_NAME = 'Full Access';

export const TRIAL_DAYS = 7;

/** Everything the paid plan unlocks. */
export const PLAN_FEATURES = [
  'Live trading with real money',
  'Unlimited broker & exchange connections',
  'Fully autonomous AI trading agents',
  'Multi-agent system (Watcher, Analyst, Risk, Trader, Healer)',
  'Stocks & crypto, 24/7 automated execution',
  'All 8 trading strategies + AI regime detection',
  'Advanced risk management & kill switch',
  'Moonshot Scanner & crypto signals',
  'AI Learning Engine & strategy optimization',
  'Copy trading and position rotation',
  'Titan Fusion conviction engine',
  'Email alerts and weekly summaries',
] as const;

/** What the 7-day trial includes before payment. */
export const TRIAL_FEATURES = [
  'Unlimited paper trading',
  '$100k virtual balance',
  'Stocks & crypto market data',
  'AI Strategy Advisor',
  'Performance analytics & equity curve',
  'Risk management dashboard',
] as const;

export const TRIAL_LIMITATIONS = [
  'Paper trading only — no live broker connections',
  'Expires after 7 days',
] as const;

// Metrics + persistence for a replay result.

import type { SimTrade } from "./replay.ts";
import type { BacktestParams } from "./params.ts";

export interface Metrics {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  endingBalance: number;
  totalReturn: number;
  expectancyUsd: number;
  expectancyPct: number;
  profitFactor: number;
  maxDrawdown: number;
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  avgWinPct: number;
  avgLossPct: number;
  sharpe: number | null;
  netPnl: number;
  avgHoldMinutes: number;
  exitBreakdown: Record<string, { count: number; share: number; pnl: number }>;
}

/** Closed trades only — an entry still open at the end of history proves nothing. */
export function closedOnly(trades: SimTrade[]): SimTrade[] {
  return trades.filter((t) => t.exitReason !== 'unclosed');
}

export function computeMetrics(rawTrades: SimTrade[], initialBalance: number): Metrics {
  const trades = closedOnly(rawTrades).sort((a, b) => a.exitAt - b.exitAt);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);

  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));

  // Equity curve on the closed-trade sequence.
  let balance = initialBalance;
  let peak = initialBalance;
  let maxDrawdown = 0;
  for (const t of trades) {
    balance += t.pnl;
    peak = Math.max(peak, balance);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - balance) / peak) * 100);
  }

  const pctReturns = trades.map((t) => t.netPct);
  const meanPct = pctReturns.length ? pctReturns.reduce((a, b) => a + b, 0) / pctReturns.length : 0;
  const sd = pctReturns.length > 1
    ? Math.sqrt(pctReturns.reduce((s, v) => s + (v - meanPct) ** 2, 0) / (pctReturns.length - 1))
    : 0;

  const exitBreakdown: Record<string, { count: number; share: number; pnl: number }> = {};
  for (const reason of ['target', 'stop', 'profit_lock', 'max_hold']) {
    const subset = trades.filter((t) => t.exitReason === reason);
    exitBreakdown[reason] = {
      count: subset.length,
      share: trades.length ? subset.length / trades.length : 0,
      pnl: round(subset.reduce((s, t) => s + t.pnl, 0)),
    };
  }

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    endingBalance: balance,
    totalReturn: initialBalance > 0 ? ((balance - initialBalance) / initialBalance) * 100 : 0,
    expectancyUsd: trades.length ? netPnl / trades.length : 0,
    expectancyPct: meanPct,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0),
    maxDrawdown,
    bestTrade: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
    worstTrade: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    avgWinPct: wins.length ? wins.reduce((s, t) => s + t.netPct, 0) / wins.length : 0,
    avgLossPct: losses.length ? losses.reduce((s, t) => s + t.netPct, 0) / losses.length : 0,
    sharpe: sd > 0 ? round((meanPct / sd) * Math.sqrt(trades.length)) : null,
    netPnl,
    avgHoldMinutes: trades.length ? trades.reduce((s, t) => s + t.heldMinutes, 0) / trades.length : 0,
    exitBreakdown,
  };
}

const round = (v: number, dp = 4) => Number(v.toFixed(dp));

/** Build the `backtest_runs` row for a symbol (or the PORTFOLIO aggregate). */
export function buildRunRow(args: {
  userId: string;
  runGroupId: string;
  symbol: string;
  params: BacktestParams;
  metrics: Metrics;
  rangeStart: string;
  rangeEnd: string;
  extraDetails: Record<string, unknown>;
}) {
  const { metrics: m, params } = args;
  return {
    user_id: args.userId,
    symbol: args.symbol,
    asset_class: params.assetClass ?? 'crypto',
    strategy: 'live_engine_replay',
    timeframe: '5m',

    period_days: params.days,
    initial_balance: round(params.initialBalance, 2),
    ending_balance: round(m.endingBalance, 2),
    total_return: round(m.totalReturn),
    win_rate: round(m.winRate),
    max_drawdown: round(m.maxDrawdown),
    profit_factor: round(m.profitFactor),
    trades_count: m.trades,
    best_trade: round(m.bestTrade, 2),
    worst_trade: round(m.worstTrade, 2),
    avg_win: round(m.avgWin, 2),
    avg_loss: round(m.avgLoss, 2),
    sharpe: m.sharpe,
    status: 'completed',
    details: {
      run_group_id: args.runGroupId,
      range_start: args.rangeStart,
      range_end: args.rangeEnd,
      wins: m.wins,
      losses: m.losses,
      net_pnl: round(m.netPnl, 2),
      expectancy_usd: round(m.expectancyUsd, 2),
      expectancy_pct: round(m.expectancyPct),
      avg_win_pct: round(m.avgWinPct),
      avg_loss_pct: round(m.avgLossPct),
      avg_hold_minutes: Math.round(m.avgHoldMinutes),
      exit_breakdown: m.exitBreakdown,
      params,
      assumptions: {
        fee_pct_round_trip: params.feePct,
        intrabar_resolution: 'pessimistic — lowest-priced exit in a bar wins; a bar spanning stop and target books the stop',
        bar_clock: '5-minute closed bars; every indicator recomputed from bars closed at or before the decision moment',
        lookahead: 'none — no bar after the decision moment is visible to the entry logic',
        direction: 'long only, matching the live engine',
        open_at_end: 'positions still open when history runs out are excluded from all metrics',
      },
      ...args.extraDetails,
    },
  };
}

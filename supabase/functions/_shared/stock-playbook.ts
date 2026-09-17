// ── EQUITY ENTRY PLAYBOOK ────────────────────────────────────────────────────
// A purpose-built long-entry playbook for US equities. It is NOT the crypto
// playbook with different constants: the evidence it weighs is the evidence an
// equity trader weighs.
//
// Non-negotiables (vetoes), in the order a desk would apply them:
//   1. No entry into a scheduled earnings report — an overnight gap ignores stops.
//   2. Long only above session VWAP (held or freshly reclaimed). Below VWAP the
//      day's average buyer is under water; that is not where longs get paid.
//   3. Respect the opening range: no longs on an opening-range breakdown, and no
//      entries while the range is still forming.
//   4. Participation required: relative volume against the stock's own
//      same-time-of-day history must show real interest.
//   5. Relative strength: the name must not be lagging the index (and, when a
//      sector proxy exists, not badly lagging its sector either).
//   6. Daily structure: above the 20-day, and above the 50-day or clearly
//      reclaiming it.
//   7. No chasing: extension beyond the opening range is capped.
//   8. Volatility must fit the target — a 0.5% ATR name cannot reach a 2% target
//      inside the hold window; an 8% ATR name is event-driven, not technical.
//
// Everything else is weighted evidence producing a 0–100 conviction score.

import type { EarningsInfo } from './earnings-calendar.ts';
import type { StockFeatures } from './stock-features.ts';

export interface StockPlaybookTuning {
  minScore?: number;
  minRvol?: number;
  minRsDayPct?: number;
  maxExtensionMult?: number;   // × opening-range width
  earningsBufferDays?: number;
  minDailyAtrPct?: number;
  maxDailyAtrPct?: number;
  maxVwapDistPct?: number;
}

export const STOCK_PLAYBOOK_DEFAULTS = {
  minScore: 62,
  minRvol: 1.15,
  minRsDayPct: -0.10,
  maxExtensionMult: 1.5,
  earningsBufferDays: 3,
  minDailyAtrPct: 0.8,
  maxDailyAtrPct: 8.0,
  maxVwapDistPct: 2.5,
  /** No entries while the opening range is still forming, or into the close. */
  minMinutesFromOpen: 30,
  maxMinutesFromOpen: 375,
  minRvolSessions: 3,
};

export interface StockPlaybookVerdict {
  passed: boolean;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  setupKey: string;
  summary: string;
  vetoes: string[];
  evidence: string[];
  flags: string[];
  components: Record<string, number>;
}

export interface StockInstrumentContext {
  kind: string;
  label: string;
  minRvol?: number;
  scoreDelta?: number;
  minDailyAtrPct?: number;
  maxDailyAtrPct?: number;
  maxSpreadPct?: number;
  /** Single-company reports only: baskets have no earnings date. */
  earningsRelevant?: boolean;
  /** Leveraged funds must be moving WITH their index, never against it. */
  requireIndexAlignment?: boolean;
  leverage?: number;
}

export interface StockPlaybookInput {
  features: StockFeatures;
  /** Nearest scheduled report, or null when the window is clear. */
  earnings: EarningsInfo | null;
  /** False when the calendar could not be fetched — reported as a flag. */
  earningsCalendarAvailable: boolean;
  /** Target the trade needs to reach, from the stock exit geometry. */
  targetPct: number;
  /** Max hold in minutes, used for the volatility-reachability test. */
  holdMinutes: number;
  tuning?: StockPlaybookTuning;
  /**
   * Instrument class the symbol belongs to (common share, ETF, leveraged fund,
   * ADR, REIT, small-cap). Shapes participation, volatility and spread tests —
   * an index ETF is not judged like a $2 micro-cap.
   */
  instrument?: StockInstrumentContext | null;
  /** Live bid/ask spread as % of mid, when available. */
  spreadPct?: number | null;
}

function band(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= low) return 0;
  if (value >= high) return 1;
  return (value - low) / (high - low);
}

export function evaluateStockPlaybook(input: StockPlaybookInput): StockPlaybookVerdict {
  const f = input.features;
  const inst = input.instrument ?? null;
  const t = { ...STOCK_PLAYBOOK_DEFAULTS, ...(input.tuning ?? {}) };

  // Instrument class raises the bar where its risks live and lowers it where the
  // crypto-style thresholds simply do not apply (an index ETF's ATR is small by
  // construction, not "too quiet to trade").
  if (inst) {
    if (Number(inst.minRvol) > 0) t.minRvol = Math.max(t.minRvol, Number(inst.minRvol));
    if (Number(inst.minDailyAtrPct) > 0) t.minDailyAtrPct = Number(inst.minDailyAtrPct);
    if (Number(inst.maxDailyAtrPct) > 0) t.maxDailyAtrPct = Number(inst.maxDailyAtrPct);
    if (Number.isFinite(Number(inst.scoreDelta))) t.minScore = t.minScore + Number(inst.scoreDelta);
  }

  const vetoes: string[] = [];
  const evidence: string[] = [];
  const flags: string[] = [];

  // ── 0. Tradability / execution cost of this instrument class ─────────────
  const spread = Number(input.spreadPct);
  if (inst && Number(inst.maxSpreadPct) > 0 && Number.isFinite(spread)) {
    if (spread > Number(inst.maxSpreadPct)) {
      vetoes.push(`bid/ask spread ${spread.toFixed(2)}% too wide for a ${inst.label} — slippage would eat the target`);
    } else {
      evidence.push(`spread ${spread.toFixed(2)}% acceptable for a ${inst.label}`);
    }
  }

  // ── 1. Earnings proximity (single companies only) ────────────────────────
  const earningsRelevant = inst ? inst.earningsRelevant !== false : true;
  if (!earningsRelevant) {
    evidence.push(`${inst?.label ?? 'basket'} — no single-company earnings risk`);
  } else if (input.earnings) {
    const { daysUntil, timing } = input.earnings;
    const holdDays = Math.ceil(input.holdMinutes / 390);
    if (daysUntil <= Math.max(t.earningsBufferDays, holdDays)) {
      vetoes.push(
        `earnings ${daysUntil === 0 ? 'today' : `in ${daysUntil}d`} (${timing}) — hold would straddle the report`,
      );
    } else {
      evidence.push(`earnings ${daysUntil}d out, outside the hold window`);
    }
  } else if (!input.earningsCalendarAvailable) {
    flags.push('earnings calendar unavailable — date not confirmed clear');
  } else {
    evidence.push('no earnings scheduled in the next 10 sessions');
  }


  // ── Session timing ───────────────────────────────────────────────────────
  if (f.minutesFromOpen < t.minMinutesFromOpen) {
    vetoes.push(`only ${Math.max(0, Math.round(f.minutesFromOpen))}m into the session — opening range still forming`);
  }
  if (f.minutesFromOpen > t.maxMinutesFromOpen) {
    vetoes.push('too close to the closing bell for a new entry');
  }

  // ── 2. VWAP ──────────────────────────────────────────────────────────────
  let vwapPoints = 0;
  if (f.vwapState === 'above_held') {
    vwapPoints = 18;
    evidence.push(`holding above VWAP (+${f.vwapDistPct.toFixed(2)}%)`);
  } else if (f.vwapState === 'reclaimed') {
    vwapPoints = 14;
    evidence.push('VWAP reclaim from below');
  } else if (f.vwapState === 'rejected') {
    vetoes.push('rejected at VWAP — sellers control the session average');
  } else {
    vetoes.push(`below session VWAP (${f.vwapDistPct.toFixed(2)}%)`);
  }
  if (f.vwapDistPct > t.maxVwapDistPct) {
    vetoes.push(`extended ${f.vwapDistPct.toFixed(2)}% above VWAP — no edge chasing this far from the benchmark`);
  }

  // ── 3. Opening range ─────────────────────────────────────────────────────
  let orPoints = 0;
  if (f.orState === 'breakdown') {
    vetoes.push('opening-range breakdown — trading below the day\'s first structure');
  } else if (f.orState === 'forming') {
    vetoes.push('opening range not yet complete');
  } else if (f.orState === 'breakout') {
    orPoints = 16;
    evidence.push(`opening-range breakout (+${f.orExtensionPct.toFixed(2)}% above the 30m high)`);
  } else {
    orPoints = 7;
    evidence.push('inside the opening range, coiling');
  }
  // No chasing: extension is capped relative to the range width itself.
  if (f.orState === 'breakout' && f.orRangePct > 0) {
    const mult = f.orExtensionPct / f.orRangePct;
    if (mult > t.maxExtensionMult) {
      vetoes.push(
        `extended ${mult.toFixed(1)}× the opening range beyond the breakout — too late to join`,
      );
    }
  }

  // ── 4. Relative volume ───────────────────────────────────────────────────
  let rvolPoints = 0;
  if (f.rvolSessions < t.minRvolSessions) {
    flags.push(`relative volume from only ${f.rvolSessions} prior sessions`);
    rvolPoints = 6;
  } else if (f.rvol < t.minRvol) {
    vetoes.push(`relative volume ${f.rvol.toFixed(2)}× its own average — no participation`);
  } else {
    rvolPoints = Math.round(6 + 10 * band(f.rvol, t.minRvol, 2.5));
    evidence.push(`relative volume ${f.rvol.toFixed(2)}× same-time average`);
  }

  // ── 5. Gap behaviour ─────────────────────────────────────────────────────
  let gapPoints = 0;
  switch (f.gapState) {
    case 'gap_up_extending':
      gapPoints = 10;
      evidence.push(`gap up ${f.gapPct.toFixed(2)}% holding and extending`);
      break;
    case 'gap_up_filled':
      vetoes.push(`gap up ${f.gapPct.toFixed(2)}% already filled back through prior close — failed gap`);
      break;
    case 'gap_down_extending':
      vetoes.push(`gap down ${f.gapPct.toFixed(2)}% and extending lower`);
      break;
    case 'gap_down_reclaiming':
      gapPoints = 8;
      evidence.push(`gap down ${f.gapPct.toFixed(2)}% reclaimed back above prior close`);
      break;
    default:
      gapPoints = 6;
      evidence.push('no material overnight gap');
  }

  // ── 6. Relative strength vs index and sector ─────────────────────────────
  // A geared fund mechanically "beats" or "lags" its index by its own multiple,
  // so relative strength says nothing about it. What matters is that the index it
  // tracks is actually up, and that the fund is moving with it, not decaying.
  let rsPoints = 0;
  const indexDayPct = f.dayChangePct - f.rsDayPct;
  if (inst?.requireIndexAlignment) {
    if (!(indexDayPct > 0)) {
      vetoes.push(`its index is ${indexDayPct.toFixed(2)}% today — a ${inst.label} must only be held with the index rising`);
    } else if (!(f.dayChangePct > indexDayPct)) {
      vetoes.push(`${inst.label} up ${f.dayChangePct.toFixed(2)}% against a ${indexDayPct.toFixed(2)}% index move — not tracking its gearing`);
    } else {
      rsPoints += Math.round(8 + 6 * band(f.dayChangePct / Math.max(0.05, indexDayPct), 1.2, Math.max(1.5, Number(inst.leverage) || 2)));
      evidence.push(`tracking a rising index (${indexDayPct.toFixed(2)}%) with ${f.dayChangePct.toFixed(2)}% gearing`);
    }
  } else if (f.rsDayPct < t.minRsDayPct) {
    vetoes.push(`lagging the index by ${Math.abs(f.rsDayPct).toFixed(2)}% today — broad-market drift, not stock strength`);
  } else {
    rsPoints += Math.round(6 + 8 * band(f.rsDayPct, 0, 2));
    evidence.push(`${f.rsDayPct >= 0 ? 'outperforming' : 'tracking'} the index by ${f.rsDayPct.toFixed(2)}%`);
  }
  if (f.rsIntradayPct > 0) {
    rsPoints += 3;
    evidence.push('leading the index over the last 30 minutes');
  }
  if (f.rsSectorPct !== null && !inst?.requireIndexAlignment) {
    if (f.rsSectorPct < -1.0) {
      vetoes.push(`lagging its sector by ${Math.abs(f.rsSectorPct).toFixed(2)}% — sector rotation is against it`);
    } else {
      rsPoints += Math.round(4 + 4 * band(f.rsSectorPct, -0.5, 1.5));
      evidence.push(`sector-relative ${f.rsSectorPct >= 0 ? '+' : ''}${f.rsSectorPct.toFixed(2)}%`);
    }
  }


  // ── 7. Daily structure ───────────────────────────────────────────────────
  let trendPoints = 0;
  if (!f.aboveSma20) {
    vetoes.push('below its 20-day average — daily structure is not supportive');
  } else {
    trendPoints += 6;
    evidence.push('above the 20-day average');
  }
  if (f.aboveSma50) {
    trendPoints += 4;
    evidence.push('above the 50-day average');
  }

  // ── 8. Volatility fit vs the target ──────────────────────────────────────
  let volPoints = 0;
  if (f.dailyAtrPct < t.minDailyAtrPct) {
    vetoes.push(`daily ATR ${f.dailyAtrPct.toFixed(2)}% too quiet to reach +${input.targetPct.toFixed(2)}%`);
  } else if (f.dailyAtrPct > t.maxDailyAtrPct) {
    vetoes.push(`daily ATR ${f.dailyAtrPct.toFixed(2)}% — event-driven volatility, not a technical setup`);
  } else {
    // The target must be a fraction of what the name typically travels over the hold.
    const sessions = Math.max(1, input.holdMinutes / 390);
    const expectedRangePct = f.dailyAtrPct * Math.sqrt(sessions);
    if (input.targetPct > expectedRangePct * 0.9) {
      vetoes.push(
        `target +${input.targetPct.toFixed(2)}% exceeds its expected ${expectedRangePct.toFixed(2)}% travel over the hold`,
      );
    } else {
      volPoints = Math.round(4 + 4 * band(expectedRangePct / Math.max(0.1, input.targetPct), 1.1, 3));
      evidence.push(`ATR ${f.dailyAtrPct.toFixed(2)}%/day supports a +${input.targetPct.toFixed(2)}% target`);
    }
  }

  const components = {
    vwap: vwapPoints,
    openingRange: orPoints,
    relativeVolume: rvolPoints,
    gap: gapPoints,
    relativeStrength: rsPoints,
    dailyTrend: trendPoints,
    volatilityFit: volPoints,
  };
  const score = Math.max(0, Math.min(100, Object.values(components).reduce((s, v) => s + v, 0)));

  const grade: StockPlaybookVerdict['grade'] = score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
  const passed = vetoes.length === 0 && score >= t.minScore;

  const setupKey = [
    'eq',
    inst?.kind ?? 'common_stock',
    f.vwapState,
    f.orState,
    f.gapState,
    f.rvol >= 2 ? 'rvol_high' : f.rvol >= 1.4 ? 'rvol_solid' : 'rvol_base',
    f.rsDayPct >= 0.5 ? 'rs_leader' : 'rs_inline',
  ].join(':');


  const summary = passed
    ? `${f.symbol} ${grade} (${score}): ${evidence.slice(0, 4).join('; ')}`
    : `${f.symbol} rejected (${score}): ${(vetoes[0] ?? 'below conviction floor')}`;

  return { passed, score, grade, setupKey, summary, vetoes, evidence, flags, components };
}

/** Resolve tuned thresholds from an account's ai_settings row. */
// deno-lint-ignore no-explicit-any
export function stockTuningFromSettings(settings: any): StockPlaybookTuning {
  const num = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) !== 0 ? Number(v) : undefined);
  return {
    minScore: num(settings?.stock_playbook_min_score),
    minRvol: num(settings?.stock_playbook_min_rvol),
    minRsDayPct: num(settings?.stock_playbook_min_rs_day_pct),
    maxExtensionMult: num(settings?.stock_playbook_max_extension_mult),
    earningsBufferDays: num(settings?.stock_earnings_buffer_days),
  };
}

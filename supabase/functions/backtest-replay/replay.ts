// ═══════════════════════════════════════════════════════════════════════════════
// ⏪ THE REPLAY — production entry/exit logic walked forward over real history
//
// Every decision uses ONLY bars closed at or before the simulated moment. The
// feature set, the playbook, the tape gate and the exit geometry are all imported
// from the same _shared modules the live engine runs on, so this is a replay of
// production rather than a re-implementation of it.
// ═══════════════════════════════════════════════════════════════════════════════

import { computeCandleTechnicals, computeHtfContext } from "../_shared/candle-technicals.ts";
import { evaluateEntryPlaybook } from "../_shared/entry-playbook.ts";
import {
  solveWideGeometry,
  WIDE_MAX_HOLD_MINUTES,
  WIDE_TRAIL_ARM_PCT,
  WIDE_TRAIL_DROP_PCT,
} from "../_shared/exit-geometry.ts";
import { solveVariantAdaptive, variantProfitLock, GEOMETRY_DEFAULTS } from "./geometry.ts";
import { evaluateTape } from "../_shared/tape-gate.ts";
import type { Bar } from "./candles.ts";
import type { BacktestParams } from "./params.ts";

/** Trailing 5m history the engine feeds its feature builder (8 hours). */
const WINDOW_5M_SECONDS = 8 * 3600;
/** Trailing hourly history the engine feeds its HTF builder (52 hours). */
const WINDOW_1H_SECONDS = 52 * 3600;

export type ExitReason = 'target' | 'stop' | 'profit_lock' | 'max_hold' | 'unclosed';

export interface SimTrade {
  symbol: string;
  entryAt: number;
  exitAt: number;
  entryPrice: number;
  exitPrice: number;
  grossPct: number;
  netPct: number;
  pnl: number;
  exitReason: ExitReason;
  stopPct: number;
  targetPct: number;
  holdMinutes: number;
  heldMinutes: number;
  score: number;
  grade: string;
  setupKey: string;
}

export interface SymbolReplay {
  symbol: string;
  trades: SimTrade[];
  barsEvaluated: number;
  barsStandDown: number;
  barsNoData: number;
  vetoTally: Record<string, number>;
  firstBarAt: number | null;
  lastBarAt: number | null;
}

/** Hour-bucket → whether the aggregate tape allowed entries in that hour. */
export type TapeTimeline = Set<number>;

const hourBucket = (sec: number) => Math.floor(sec / 3600) * 3600;

/**
 * Rebuild the aggregate tape read for every hour of the test window from cached
 * hourly closes, using the same thresholds the live engine gates on.
 */
export function buildTapeTimeline(
  hourlyBySymbol: Map<string, Bar[]>,
  params: BacktestParams,
): { open: TapeTimeline; hoursEvaluated: number; hoursOpen: number } {
  const closesBySymbol = new Map<string, Map<number, number>>();
  const allHours = new Set<number>();
  for (const [symbol, bars] of hourlyBySymbol) {
    const m = new Map<number, number>();
    for (const b of bars) {
      m.set(hourBucket(b.start), b.close);
      allHours.add(hourBucket(b.start));
    }
    closesBySymbol.set(symbol, m);
  }

  const hours = [...allHours].sort((a, b) => a - b);
  const open: TapeTimeline = new Set();
  let evaluated = 0;

  for (const t of hours) {
    const changes24h: number[] = [];
    const changes1h: number[] = [];
    for (const closes of closesBySymbol.values()) {
      const now = closes.get(t);
      if (!(now! > 0)) continue;
      const prev24 = closes.get(t - 86400);
      const prev1 = closes.get(t - 3600);
      if (prev24 && prev24 > 0) changes24h.push(((now! - prev24) / prev24) * 100);
      if (prev1 && prev1 > 0) changes1h.push(((now! - prev1) / prev1) * 100);
    }
    const read = evaluateTape(changes24h, changes1h, params.tape);
    evaluated++;
    if (read.rising) open.add(t);
  }

  return { open, hoursEvaluated: evaluated, hoursOpen: open.size };
}

/**
 * Walk one market's 5-minute series forward and produce every trade the live rules
 * would have taken. Unconstrained by portfolio slots — the slot cap is applied later
 * across all markets so the portfolio result respects concurrency.
 */
export function replaySymbol(
  symbol: string,
  bars5m: Bar[],
  bars1h: Bar[],
  tapeOpen: TapeTimeline,
  params: BacktestParams,
  positionValue: number,
): SymbolReplay {
  const out: SymbolReplay = {
    symbol,
    trades: [],
    barsEvaluated: 0,
    barsStandDown: 0,
    barsNoData: 0,
    vetoTally: {},
    firstBarAt: bars5m.length ? bars5m[0].start : null,
    lastBarAt: bars5m.length ? bars5m[bars5m.length - 1].start : null,
  };
  if (bars5m.length < 60) return out;

  const hourlyClose = new Map<number, number>();
  for (const b of bars1h) hourlyClose.set(hourBucket(b.start), b.close);

  const tally = (reason: string) => { out.vetoTally[reason] = (out.vetoTally[reason] ?? 0) + 1; };

  let left5 = 0;   // sliding window start for the 5m series
  let right1 = 0;  // pointer into the hourly series

  // `i` is the most recently CLOSED 5-minute bar at the simulated moment.
  let i = 0;
  while (i < bars5m.length) {
    const t = bars5m[i].start;
    const now = t + 300; // the bar at `i` has just closed

    while (left5 < i && bars5m[left5].start <= now - WINDOW_5M_SECONDS) left5++;
    while (right1 + 1 < bars1h.length && bars1h[right1 + 1].start <= t) right1++;

    out.barsEvaluated++;

    // ── GATE 1: aggregate tape ─────────────────────────────────────────────────
    if (!tapeOpen.has(hourBucket(t))) {
      out.barsStandDown++;
      i++;
      continue;
    }

    const window5 = bars5m.slice(left5, i + 1);
    const tech = computeCandleTechnicals(window5, now);
    if (!tech) {
      out.barsNoData++;
      i++;
      continue;
    }

    let left1 = right1;
    while (left1 > 0 && bars1h[left1].start > t - WINDOW_1H_SECONDS) left1--;
    const htf = computeHtfContext(bars1h.slice(left1, right1 + 1), now);

    // ── GATE 2: the engine's final pre-playbook technical blocks ───────────────
    if (tech.rsi14 !== undefined && tech.rsi14 > 75) { tally('final_rsi_over_75'); i++; continue; }
    if (tech.percentB !== undefined && tech.percentB > 1.0) { tally('final_above_upper_bb'); i++; continue; }

    // ── GEOMETRY: exactly what this trade would be given ──────────────────────
    const swingAtrPct = htf?.swingAtrPct;
    const geo = params.wideStopMode
      ? solveWideGeometry(swingAtrPct)
      : solveAdaptiveGeometry(swingAtrPct, params.stopPct);
    const holdMinutes = params.wideStopMode
      ? WIDE_MAX_HOLD_MINUTES
      : (geo as { holdMinutes?: number }).holdMinutes ?? 1440;

    // 24h change from real hourly closes (never an implicit 0%).
    const h = hourBucket(t);
    const close24 = hourlyClose.get(h - 86400);
    const change24h = close24 && close24 > 0 ? ((tech.lastClose - close24) / close24) * 100 : undefined;

    // ── GATE 3: the full entry playbook ───────────────────────────────────────
    const verdict = evaluateEntryPlaybook({
      symbol,
      change5m: tech.change5m,
      change15m: tech.change15m,
      change1h: htf?.change1h,
      change24h,
      rsi14: tech.rsi14,
      percentB: tech.percentB,
      bbWidth: tech.bbWidth,
      ema9: tech.ema9,
      ema21: tech.ema21,
      lastClose: tech.lastClose,
      macdHist: tech.macdHist,
      macdHistPrev: tech.macdHistPrev,
      vwap: tech.vwap,
      higherLows: tech.higherLows,
      volumeRatio: tech.volumeRatio,
      atrPct: tech.atrPct,
      swingAtrPct,
      volClass: tech.volClass,
      supportContext: tech.supportContext,
      distanceToSupportPct: tech.distanceToSupportPct,
      htfAboveEma: htf?.htfAboveEma,
      htfSlopePct: htf?.htfSlopePct,
      strategy: 'scalp',
      targetPct: geo.takeProfitPct,
      tuning: params.playbookTuning,
    });

    if (!verdict.passed) {
      tally(verdict.vetoes.length ? normaliseVeto(verdict.vetoes[0]) : 'score_below_floor');
      i++;
      continue;
    }

    // ── ENTRY ─────────────────────────────────────────────────────────────────
    const entryPrice = tech.lastClose;
    const trade = simulateExit(
      symbol, bars5m, i, entryPrice, geo.stopLossPct, geo.takeProfitPct,
      holdMinutes, params, positionValue, verdict.score, verdict.grade, verdict.setupKey,
    );
    out.trades.push(trade);

    // Resume scanning from the bar the position closed on — one position per market
    // at a time, exactly as the live one-open-position-per-symbol rule enforces.
    const resumeAt = bars5m.findIndex((b, idx) => idx > i && b.start >= trade.exitAt);
    i = resumeAt > i ? resumeAt : i + 1;
  }

  return out;
}

/**
 * Forward-simulate the exit contract against subsequent bars.
 *
 * Within a single bar the ticks cannot be ordered, so the PESSIMISTIC reading is
 * always taken: the lowest-priced exit the bar could have produced wins. A bar whose
 * range spans both stop and target books the stop.
 */
function simulateExit(
  symbol: string,
  bars: Bar[],
  entryIdx: number,
  entryPrice: number,
  stopPct: number,
  targetPct: number,
  holdMinutes: number,
  params: BacktestParams,
  positionValue: number,
  score: number,
  grade: string,
  setupKey: string,
): SimTrade {
  const entryAt = bars[entryIdx].start;
  const holdSeconds = holdMinutes * 60;

  const lock = params.wideStopMode
    ? { armPct: WIDE_TRAIL_ARM_PCT, givebackPct: WIDE_TRAIL_DROP_PCT }
    : solveProfitLock(stopPct);

  let peakPct = 0;
  let floorPct: number | null = null;

  const close = (exitAt: number, exitPrice: number, reason: ExitReason): SimTrade => {
    const grossPct = ((exitPrice - entryPrice) / entryPrice) * 100;
    const netPct = grossPct - params.feePct;
    return {
      symbol, entryAt, exitAt, entryPrice, exitPrice,
      grossPct, netPct,
      pnl: positionValue * (netPct / 100),
      exitReason: reason,
      stopPct, targetPct, holdMinutes,
      heldMinutes: Math.round((exitAt - entryAt) / 60),
      score, grade, setupKey,
    };
  };

  for (let j = entryIdx + 1; j < bars.length; j++) {
    const bar = bars[j];
    const lowPct = ((bar.low - entryPrice) / entryPrice) * 100;
    const highPct = ((bar.high - entryPrice) / entryPrice) * 100;

    // 1. Stop — always resolved first.
    if (lowPct <= -stopPct) {
      return close(bar.start, entryPrice * (1 - stopPct / 100), 'stop');
    }
    // 2. Profit lock — a lower exit than the target, so pessimistically it wins.
    if (floorPct !== null && lowPct <= floorPct) {
      return close(bar.start, entryPrice * (1 + floorPct / 100), 'profit_lock');
    }
    // 3. Target.
    if (highPct >= targetPct) {
      return close(bar.start, entryPrice * (1 + targetPct / 100), 'target');
    }
    // 4. Max hold — exit at the bar close once the window is spent.
    if (bar.start - entryAt >= holdSeconds) {
      return close(bar.start, bar.close, 'max_hold');
    }

    // Arm / raise the profit lock from this bar's peak, for use on LATER bars only.
    peakPct = Math.max(peakPct, highPct);
    if (peakPct >= lock.armPct) {
      // Never let a "protected" winner be handed back at a net loss: the floor can
      // not sit below the round-trip fee, matching the live exit engine.
      floorPct = Math.max(peakPct - lock.givebackPct, params.feePct);
    }
  }

  // Ran out of history with the position still open — excluded from results.
  const lastBar = bars[bars.length - 1];
  return { ...close(lastBar.start, lastBar.close, 'unclosed') };
}

/** Collapse a veto string down to a stable, countable reason. */
function normaliseVeto(v: string): string {
  const s = v.toLowerCase();
  if (s.includes('5m candle')) return 'trigger_candle_not_rising';
  if (s.includes('ema9')) return 'structure_ema9_below_ema21';
  if (s.includes('macd')) return 'macd_falling';
  if (s.includes('volume') || s.includes('participation')) return 'no_volume_participation';
  if (s.includes('band') || s.includes('%b')) return 'pinned_to_upper_band';
  if (s.includes('rsi')) return 'overbought_rsi';
  if (s.includes('support')) return 'bad_location_vs_support';
  if (s.includes('spike') || s.includes('chase')) return 'vertical_chase';
  if (s.includes('vol')) return 'untradeable_volatility';
  if (s.includes('trend') || s.includes('1h')) return 'hostile_higher_timeframe';
  if (s.includes('coverage') || s.includes('data')) return 'insufficient_data';
  if (s.includes('reach') || s.includes('target')) return 'target_unreachable';
  return 'other';
}

/**
 * Apply the portfolio concurrency cap chronologically across every market's trades.
 * A signal that arrives with all slots full is skipped, exactly as the live slot cap
 * behaves — so the portfolio row reflects what the account could actually have held.
 */
export function applySlotCap(all: SimTrade[], maxConcurrent: number): { taken: SimTrade[]; skipped: number } {
  const ordered = [...all].sort((a, b) => a.entryAt - b.entryAt);
  const openUntil: number[] = [];
  const taken: SimTrade[] = [];
  let skipped = 0;

  for (const t of ordered) {
    for (let k = openUntil.length - 1; k >= 0; k--) {
      if (openUntil[k] <= t.entryAt) openUntil.splice(k, 1);
    }
    if (openUntil.length >= maxConcurrent) { skipped++; continue; }
    openUntil.push(t.exitAt);
    taken.push(t);
  }

  return { taken, skipped };
}

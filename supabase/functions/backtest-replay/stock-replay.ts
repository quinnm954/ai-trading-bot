// ═══════════════════════════════════════════════════════════════════════════════
// ⏪ EQUITY REPLAY — the live stock rules walked forward over minute-level history
//
// The crypto replay steps 5-minute bars, which is fine for crypto because nothing
// in the crypto playbook cares about the time of day. Equities are different: the
// stock playbook reads session VWAP, the first 30 minutes of the day, and relative
// volume against the same minute of prior sessions. Reproducing those honestly
// needs MINUTE bars and a real session clock, which is what this module replays.
//
// Guarantees:
//   • No look-ahead. Every decision sees only bars that closed at or before the
//     simulated minute, and the day's tape gate is resolved from the PREVIOUS
//     session's close, never from the day being traded.
//   • Same code as production for the actual decision: computeStockFeatures*,
//     evaluateStockPlaybook, solveStockGeometry, evaluateStockTape.
//   • Overnight gaps are real fills. A position held over a session boundary that
//     opens through its stop is filled at the OPEN, not at the stop price.
// ═══════════════════════════════════════════════════════════════════════════════

import { computeHtfContext } from "../_shared/candle-technicals.ts";
import {
  computeStockFeaturesFromSessions,
  groupSessions,
  SECTOR_ETF_BY_SYMBOL,
  type Bar as FeatureBar,
  type StockSession,
} from "../_shared/stock-features.ts";
import { evaluateStockPlaybook } from "../_shared/stock-playbook.ts";
import { solveStockGeometry } from "../_shared/stock-geometry.ts";
import { classifyInstrument, profileFor } from "../_shared/instrument-classes.ts";

import { evaluateStockTape, realizedVolatilityPct, type IndexRead } from "../_shared/stock-tape.ts";
import type { Bar } from "./candles.ts";
import type { BacktestParams } from "./params.ts";
import type { ExitReason, SimTrade, SymbolReplay } from "./replay.ts";

/** Index and volatility context symbols a stock run always needs cached. */
export const STOCK_CONTEXT_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'VIXY'];

/** Every context symbol for a universe: indices, the volatility proxy and sectors. */
export function stockContextSymbols(universe: string[]): string[] {
  const sectors = universe
    .map((s) => SECTOR_ETF_BY_SYMBOL[s.toUpperCase()])
    .filter((s): s is string => !!s);
  return [...new Set([...STOCK_CONTEXT_SYMBOLS, ...sectors])];
}

const ET_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Eastern-time calendar day of a cached bar (bars are keyed by epoch seconds). */
export function etDay(startSec: number): string {
  return ET_DAY.format(new Date(startSec * 1000));
}

/** Cached bars → the shape the shared feature/playbook code expects. */
export function toFeatureBars(bars: Bar[]): FeatureBar[] {
  return bars.map((b) => ({
    t: new Date(b.start * 1000).toISOString(),
    o: b.open,
    h: b.high,
    l: b.low,
    c: b.close,
    v: b.volume,
  }));
}

// ── TAPE TIMELINE ────────────────────────────────────────────────────────────

export interface StockTapeTimeline {
  /** ET days on which entries were allowed. */
  openDays: Set<string>;
  daysEvaluated: number;
  daysOpen: number;
  regimeByDay: Record<string, string>;
}

function sma(values: number[], n: number): number | null {
  if (values.length < n) return null;
  return values.slice(-n).reduce((s, v) => s + v, 0) / n;
}

/**
 * Resolve the equity tape gate for every session in the window.
 *
 * A session is judged from data available BEFORE it starts — the prior close's
 * index trend, breadth, advance/decline and realized volatility — so the gate can
 * never be informed by the day it is gating.
 */
export function buildStockTapeTimeline(
  dailyByUniverseSymbol: Map<string, Bar[]>,
  dailyByContextSymbol: Map<string, Bar[]>,
  params: BacktestParams,
): StockTapeTimeline {
  const closesByDay = new Map<string, Map<string, number>>(); // symbol → day → close
  const allDays = new Set<string>();

  const index = (m: Map<string, Bar[]>) => {
    for (const [symbol, bars] of m) {
      const byDay = new Map<string, number>();
      for (const b of bars) {
        const d = etDay(b.start);
        byDay.set(d, b.close);
        allDays.add(d);
      }
      closesByDay.set(symbol.toUpperCase(), byDay);
    }
  };
  index(dailyByUniverseSymbol);
  index(dailyByContextSymbol);

  const days = [...allDays].sort();
  const universeSymbols = [...dailyByUniverseSymbol.keys()].map((s) => s.toUpperCase());

  const openDays = new Set<string>();
  const regimeByDay: Record<string, string> = {};
  let evaluated = 0;

  const changeOn = (symbol: string, dayIdx: number): number | null => {
    const byDay = closesByDay.get(symbol);
    if (!byDay) return null;
    const now = byDay.get(days[dayIdx]);
    const prev = dayIdx > 0 ? byDay.get(days[dayIdx - 1]) : undefined;
    if (!(now! > 0) || !(prev! > 0)) return null;
    return ((now! - prev!) / prev!) * 100;
  };

  const seriesUpTo = (symbol: string, dayIdx: number): number[] => {
    const byDay = closesByDay.get(symbol);
    if (!byDay) return [];
    const out: number[] = [];
    for (let i = 0; i <= dayIdx; i++) {
      const c = byDay.get(days[i]);
      if (c && c > 0) out.push(c);
    }
    return out;
  };

  // `i` is the session being decided; the read is taken from session i-1.
  for (let i = 1; i < days.length; i++) {
    const asOf = i - 1;

    const indices: IndexRead[] = [];
    for (const symbol of ['SPY', 'QQQ', 'IWM']) {
      const dayChangePct = changeOn(symbol, asOf);
      if (dayChangePct === null) continue;
      const closes = seriesUpTo(symbol, asOf);
      const s20 = sma(closes, 20);
      const last = closes[closes.length - 1];
      const fiveBack = closes.length >= 6 ? closes[closes.length - 6] : closes[0];
      indices.push({
        symbol,
        dayChangePct,
        aboveSma20: s20 !== null ? last > s20 : false,
        fiveDayChangePct: fiveBack > 0 ? ((last - fiveBack) / fiveBack) * 100 : 0,
      });
    }

    const universeChanges = universeSymbols
      .map((s) => changeOn(s, asOf))
      .filter((v): v is number => v !== null);

    const read = evaluateStockTape({
      indices,
      universeChanges,
      realizedVolPct: realizedVolatilityPct(seriesUpTo('SPY', asOf)),
      vixProxyChangePct: changeOn('VIXY', asOf),
      thresholds: {
        minIndexPct: params.tape.min24hPct,
        minBreadth: params.tape.minBreadth,
        minAdRatio: params.tape.minAdRatio,
        maxRealizedVolPct: params.tape.maxRealizedVolPct,
      },

    });

    evaluated++;
    regimeByDay[days[i]] = read.regime;
    if (read.rising) openDays.add(days[i]);
  }

  return { openDays, daysEvaluated: evaluated, daysOpen: openDays.size, regimeByDay };
}

// ── INTRADAY CONTEXT (index / sector relative strength) ──────────────────────

export interface IntradayIndex {
  /** ET day → prior daily close, for the day-change leg. */
  prevClose: Map<string, number>;
  /** ET day → minute-of-day (epoch seconds) → close, for point-in-time reads. */
  closes: Map<string, Bar[]>;
}

export function buildIntradayIndex(minuteBars: Bar[], dailyBars: Bar[]): IntradayIndex {
  const dailyDays: string[] = [];
  const dailyClose = new Map<string, number>();
  for (const b of dailyBars) {
    const d = etDay(b.start);
    if (!dailyClose.has(d)) dailyDays.push(d);
    dailyClose.set(d, b.close);
  }
  dailyDays.sort();

  const prevClose = new Map<string, number>();
  for (let i = 1; i < dailyDays.length; i++) {
    prevClose.set(dailyDays[i], dailyClose.get(dailyDays[i - 1])!);
  }

  const closes = new Map<string, Bar[]>();
  for (const b of minuteBars) {
    const d = etDay(b.start);
    const arr = closes.get(d) ?? [];
    arr.push(b);
    closes.set(d, arr);
  }
  for (const arr of closes.values()) arr.sort((a, b) => a.start - b.start);

  return { prevClose, closes };
}

/** Close at or before `atSec` within that ET day, plus the close ~30m earlier. */
function pointInTime(idx: IntradayIndex, day: string, atSec: number): { now: number | null; ago30: number | null } {
  const arr = idx.closes.get(day);
  if (!arr || arr.length === 0) return { now: null, ago30: null };
  let now: number | null = null;
  let ago30: number | null = null;
  for (const b of arr) {
    if (b.start > atSec) break;
    now = b.close;
    if (b.start <= atSec - 30 * 60) ago30 = b.close;
  }
  return { now, ago30 };
}

function dayChangeAt(idx: IntradayIndex, day: string, atSec: number): number {
  const prev = idx.prevClose.get(day);
  const { now } = pointInTime(idx, day, atSec);
  if (!prev || !(prev > 0) || now === null) return 0;
  return ((now - prev) / prev) * 100;
}

function intradayChangeAt(idx: IntradayIndex, day: string, atSec: number): number {
  const { now, ago30 } = pointInTime(idx, day, atSec);
  if (now === null || ago30 === null || !(ago30 > 0)) return 0;
  return ((now - ago30) / ago30) * 100;
}

// ── SYMBOL REPLAY ────────────────────────────────────────────────────────────

export interface StockReplayInput {
  symbol: string;
  minuteBars: Bar[];
  hourlyBars: Bar[];
  dailyBars: Bar[];
  spy: IntradayIndex;
  sector: IntradayIndex | null;
  tape: StockTapeTimeline;
  params: BacktestParams;
  positionValue: number;
}

/** Decision cadence in minutes — the engine does not re-evaluate every tick. */
const DECISION_STEP_MINUTES = 5;
/** Prior sessions kept in the feature window; relative volume needs a real sample. */
const RVOL_LOOKBACK_SESSIONS = 12;

export function replayStockSymbol(input: StockReplayInput): SymbolReplay {
  const { symbol, params, positionValue } = input;
  // Instrument class for this symbol (ETF, leveraged fund, ADR, REIT, micro-cap…).
  // Historical issuer names are not cached, so classification uses the symbol
  // lists plus the replay's own price/turnover context.
  const lastDaily = input.dailyBars.length > 0 ? input.dailyBars[input.dailyBars.length - 1] : null;
  const instrumentClass_ = classifyInstrument({
    symbol,
    price: lastDaily?.close ?? null,
    dollarVolume: lastDaily ? (lastDaily.volume ?? 0) * (lastDaily.close ?? 0) : null,
  });
  const instrumentProfile_ = profileFor(instrumentClass_);
  const out: SymbolReplay = {
    symbol,
    trades: [],
    barsEvaluated: 0,
    barsStandDown: 0,
    barsNoData: 0,
    vetoTally: {},
    firstBarAt: input.minuteBars.length ? input.minuteBars[0].start : null,
    lastBarAt: input.minuteBars.length ? input.minuteBars[input.minuteBars.length - 1].start : null,
  };
  if (input.minuteBars.length < 400 || input.dailyBars.length < 25) return out;
  if (!instrumentProfile_.tradable) {
    out.vetoTally[instrumentProfile_.skipReason ?? 'instrument_not_tradable'] = 1;
    return out;
  }

  const tally = (reason: string) => { out.vetoTally[reason] = (out.vetoTally[reason] ?? 0) + 1; };


  // Group the whole minute history into regular-hours sessions ONCE. Every later
  // decision re-slices this, so per-decision cost does not grow with the window.
  const sessions: StockSession[] = groupSessions(toFeatureBars(input.minuteBars));
  if (sessions.length < 6) return out;

  // Daily bars strictly before a given session, for SMA/ATR/prior close.
  const dailyDays = input.dailyBars.map((b) => etDay(b.start));
  const dailyFeature = toFeatureBars(input.dailyBars);
  const dailyBefore = (day: string): FeatureBar[] => {
    let end = 0;
    while (end < dailyDays.length && dailyDays[end] < day) end++;
    return dailyFeature.slice(0, end);
  };

  // Flat chronological list of session bars for forward exit simulation.
  const flat: Array<{ day: string; bar: FeatureBar; sec: number }> = [];
  for (const s of sessions) {
    for (const b of s.bars) flat.push({ day: s.day, bar: b, sec: Math.floor(Date.parse(b.t) / 1000) });
  }
  const flatIndexBySec = new Map<number, number>();
  flat.forEach((f, i) => flatIndexBySec.set(f.sec, i));

  let blockedUntilSec = 0;

  for (let si = RVOL_LOOKBACK_SESSIONS; si < sessions.length; si++) {
    const session = sessions[si];
    const priorSessions = sessions.slice(Math.max(0, si - RVOL_LOOKBACK_SESSIONS), si);
    const dailyForSession = dailyBefore(session.day);
    if (dailyForSession.length < 25) continue;

    // ── GATE 1: equity tape, resolved from the prior session's close ─────────
    if (!input.tape.openDays.has(session.day)) {
      out.barsStandDown += Math.ceil(session.bars.length / DECISION_STEP_MINUTES);
      continue;
    }

    for (let bi = 0; bi < session.bars.length; bi += DECISION_STEP_MINUTES) {
      const bar = session.bars[bi];
      const nowSec = Math.floor(Date.parse(bar.t) / 1000) + 60; // this minute has closed
      if (nowSec <= blockedUntilSec) continue;

      out.barsEvaluated++;

      const truncated: StockSession = { day: session.day, bars: session.bars.slice(0, bi + 1) };

      const features = computeStockFeaturesFromSessions({
        symbol,
        sessions: [...priorSessions, truncated],
        daily: dailyForSession,
        indexDayChangePct: dayChangeAt(input.spy, session.day, nowSec),
        indexIntradayPct: intradayChangeAt(input.spy, session.day, nowSec),
        sectorDayChangePct: input.sector ? dayChangeAt(input.sector, session.day, nowSec) : null,
        barMinutes: 1,
      });
      if (!features) { out.barsNoData++; continue; }

      // ── GEOMETRY: hourly ATR from closed hourly bars, exactly like live ────
      let h = 0;
      while (h < input.hourlyBars.length && input.hourlyBars[h].start + 3600 <= nowSec) h++;
      const hourlyWindow = input.hourlyBars.slice(Math.max(0, h - 60), h);
      const htf = computeHtfContext(hourlyWindow, nowSec);
      const geo = solveStockGeometry(
        htf?.swingAtrPct ?? features.dailyAtrPct,
        params.stopPct,
        {
          minStopPct: params.geometry.minStopPct,
          maxStopPct: params.geometry.maxRiskPct,
          atrMult: params.geometry.stopAtrMult,
        },
        instrumentProfile_,
      );
      if (!geo.reachable) { tally('target_unreachable'); continue; }

      // ── GATE 2: the equity entry playbook ─────────────────────────────────
      const verdict = evaluateStockPlaybook({
        features,
        // Historical earnings dates are not replayed; the playbook therefore
        // FLAGS instead of vetoing, which makes replay strictly less selective
        // than live (live blocks entries near a scheduled report).
        earnings: null,
        earningsCalendarAvailable: false,
        targetPct: geo.takeProfitPct,
        holdMinutes: geo.holdMinutes,
        tuning: params.stockPlaybook,
        // Same instrument-class shaping the live engine applies, so an ETF, a
        // leveraged fund and a micro-cap replay under their own rules.
        instrument: {
          kind: instrumentProfile_.kind,
          label: instrumentProfile_.label,
          minRvol: instrumentProfile_.minRvol,
          scoreDelta: instrumentProfile_.scoreDelta,
          minDailyAtrPct: instrumentProfile_.minDailyAtrPct,
          maxDailyAtrPct: instrumentProfile_.maxDailyAtrPct,
          earningsRelevant: instrumentProfile_.earningsRelevant,
          requireIndexAlignment: instrumentProfile_.requireIndexAlignment,
          leverage: instrumentClass_.leverage,
        },
      });
      if (!verdict.passed) {
        tally(normaliseStockVeto(verdict.vetoes[0] ?? 'score_below_floor'));
        continue;
      }


      // ── ENTRY ─────────────────────────────────────────────────────────────
      const entryFlatIdx = flatIndexBySec.get(Math.floor(Date.parse(bar.t) / 1000));
      if (entryFlatIdx === undefined) continue;

      const trade = simulateStockExit({
        symbol,
        flat,
        entryIdx: entryFlatIdx,
        entryPrice: features.lastPrice,
        stopPct: geo.stopLossPct,
        targetPct: geo.takeProfitPct,
        holdMinutes: geo.holdMinutes,
        feePct: params.feePct,
        // Same class-based size scaling the live engine applies.
        positionValue: positionValue * instrumentProfile_.positionScale,

        score: verdict.score,
        grade: verdict.grade,
        setupKey: verdict.setupKey,
      });
      out.trades.push(trade);

      // One open position per symbol, as live enforces.
      blockedUntilSec = trade.exitAt;
    }
  }

  return out;
}

/**
 * Forward-simulate a long stock position over traded minutes.
 *
 * Pessimistic within a bar (a bar spanning stop and target books the stop), and
 * gap-honest across sessions: if a bar OPENS beyond a level, that open is the fill.
 */
function simulateStockExit(args: {
  symbol: string;
  flat: Array<{ day: string; bar: FeatureBar; sec: number }>;
  entryIdx: number;
  entryPrice: number;
  stopPct: number;
  targetPct: number;
  holdMinutes: number;
  feePct: number;
  positionValue: number;
  score: number;
  grade: string;
  setupKey: string;
}): SimTrade {
  const { flat, entryIdx, entryPrice, stopPct, targetPct } = args;
  const entryAt = flat[entryIdx].sec;
  const stopPrice = entryPrice * (1 - stopPct / 100);
  const targetPrice = entryPrice * (1 + targetPct / 100);

  const close = (exitAt: number, exitPrice: number, reason: ExitReason): SimTrade => {
    const grossPct = ((exitPrice - entryPrice) / entryPrice) * 100;
    const netPct = grossPct - args.feePct;
    return {
      symbol: args.symbol,
      entryAt,
      exitAt,
      entryPrice,
      exitPrice,
      grossPct,
      netPct,
      pnl: args.positionValue * (netPct / 100),
      exitReason: reason,
      stopPct,
      targetPct,
      holdMinutes: args.holdMinutes,
      // Held time is counted in TRADED minutes: an equity hold window is a market
      // window, so an overnight pause must not consume it.
      heldMinutes: 0,
      score: args.score,
      grade: args.grade,
      setupKey: args.setupKey,
    };
  };

  const withHeld = (t: SimTrade, tradedMinutes: number): SimTrade => ({ ...t, heldMinutes: tradedMinutes });

  for (let j = entryIdx + 1; j < flat.length; j++) {
    const { bar, sec } = flat[j];
    const tradedMinutes = j - entryIdx;

    // Overnight / session-boundary gap: the open is the first available price.
    if (bar.o <= stopPrice) return withHeld(close(sec, bar.o, 'stop'), tradedMinutes);
    if (bar.o >= targetPrice) return withHeld(close(sec, bar.o, 'target'), tradedMinutes);

    if (bar.l <= stopPrice) return withHeld(close(sec, stopPrice, 'stop'), tradedMinutes);
    if (bar.h >= targetPrice) return withHeld(close(sec, targetPrice, 'target'), tradedMinutes);

    if (tradedMinutes >= args.holdMinutes) return withHeld(close(sec, bar.c, 'max_hold'), tradedMinutes);
  }

  const lastIdx = flat.length - 1;
  return withHeld(close(flat[lastIdx].sec, flat[lastIdx].bar.c, 'unclosed'), lastIdx - entryIdx);
}

/** Collapse an equity veto string into a stable, countable reason. */
export function normaliseStockVeto(v: string): string {
  const s = v.toLowerCase();
  if (s.includes('earnings')) return 'earnings_window';
  if (s.includes('vwap')) return s.includes('extended') ? 'extended_above_vwap' : 'below_or_rejected_at_vwap';
  if (s.includes('opening range') || s.includes('opening-range')) return 'opening_range_unsupportive';
  if (s.includes('relative volume')) return 'no_relative_volume';
  if (s.includes('gap')) return 'failed_gap';
  if (s.includes('index')) return 'lagging_the_index';
  if (s.includes('sector')) return 'lagging_its_sector';
  if (s.includes('20-day') || s.includes('50-day')) return 'daily_structure_weak';
  if (s.includes('atr') || s.includes('volatility')) return 'volatility_mismatch';
  if (s.includes('target')) return 'target_unreachable';
  if (s.includes('closing bell')) return 'too_close_to_the_close';
  if (s.includes('session')) return 'session_timing';
  if (s.includes('score')) return 'score_below_floor';
  return 'other';
}

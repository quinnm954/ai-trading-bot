// ═══════════════════════════════════════════════════════════════════════════════
// 🧪 BACKTEST REPLAY — repeatable historical evaluation of the live trading rules
//
// Evaluation only. This function never places a trade, never touches account
// settings, positions, or the tuner. It exists so a parameter change can be judged
// against 60–90 days of real Coinbase history instead of a handful of paper trades.
//
// Actions:
//   start  → resolve the universe + parameters, create a job, begin candle sync
//   tick   → do one bounded slice of work (sync a market, or replay a market)
//   status → read the job back
//
// `tick` is chunked and resumable so no invocation runs past the wall-clock limit;
// the caller polls until the job reaches `done`.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  cacheBars,
  cacheKey,
  cachedCount,
  fetchHistory,
  fetchStockHistory,
  fetchStockUniverse,
  fetchUniverse,
  loadBars,
  GRANULARITY_SECONDS,
  type Bar,
  type Granularity,
} from "./candles.ts";
import { loadDataCreds } from "../_shared/alpaca-creds.ts";
import type { AlpacaCreds } from "../_shared/alpaca.ts";

import { resolveParams, type BacktestParams } from "./params.ts";
import {
  applySlotCap,
  buildTapeTimeline,
  replaySymbol,
  type SimTrade,
  type SymbolReplay,
} from "./replay.ts";
import { buildRunRow, closedOnly, computeMetrics } from "./stats.ts";
import {
  buildIntradayIndex,
  buildStockTapeTimeline,
  etDay,
  replayStockSymbol,
  stockContextSymbols,
  type IntradayIndex,
  type StockTapeTimeline,
} from "./stock-replay.ts";
import { SECTOR_ETF_BY_SYMBOL } from "../_shared/stock-features.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** Markets synced per tick. One market ≈ 80 paginated Coinbase calls. */
const SYNC_PER_TICK = 1;
/** Markets replayed per tick. */
const REPLAY_PER_TICK = 3;
/**
 * A stock replay walks MINUTE bars over a full session clock, which is ~30× the
 * work of a 5-minute crypto walk, so stock ticks take one market at a time.
 */
const STOCK_REPLAY_PER_TICK = 1;

/**
 * Bars a run needs cached.
 *  • crypto: 5-minute decisions + hourly context (as before)
 *  • stocks: MINUTE bars — session VWAP, the opening range and same-minute
 *    relative volume cannot be reproduced from 5-minute bars — plus hourly bars
 *    for the ATR the exit geometry is solved from, and daily bars for the
 *    20/50-day structure, ATR%, prior close and the tape/breadth timeline.
 */
function granularitiesFor(assetClass: 'crypto' | 'stocks'): readonly Granularity[] {
  return assetClass === 'stocks'
    ? ['ONE_MINUTE', 'ONE_HOUR', 'ONE_DAY'] as const
    : ['FIVE_MINUTE', 'ONE_HOUR'] as const;
}

/** Every symbol a run must cache: the replay universe plus index/sector context. */
function syncList(assetClass: 'crypto' | 'stocks', universe: string[]): string[] {
  return assetClass === 'stocks' ? [...universe, ...stockContextSymbols(universe)] : universe;
}

/** Context symbols only need daily bars, except SPY and sectors used for intraday RS. */
function granularitiesForContext(symbol: string, universe: string[]): readonly Granularity[] {
  const sectorsInUse = new Set(
    universe.map((s) => SECTOR_ETF_BY_SYMBOL[s.toUpperCase()]).filter(Boolean),
  );
  return symbol === 'SPY' || sectorsInUse.has(symbol)
    ? ['ONE_MINUTE', 'ONE_DAY'] as const
    : ['ONE_DAY'] as const;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // ── Auth: validate the caller's JWT in code (verify_jwt is off by default). ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ success: false, error: 'unauthorized' }, 401);
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json({ success: false, error: 'unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'start');

    if (action === 'start') return await startJob(admin, user.id, body);
    if (action === 'tick') return await tickJob(admin, user.id, String(body?.jobId ?? ''));
    if (action === 'status') return await statusJob(admin, user.id, String(body?.jobId ?? ''));
    if (action === 'repair') return await repairJob(admin, user.id, String(body?.jobId ?? ''));
    return json({ success: false, error: `unknown action: ${action}` }, 400);
  } catch (err) {
    console.error('backtest-replay failed:', err);
    return json({ success: false, error: String(err instanceof Error ? err.message : err) }, 500);
  }
});

// ── START ────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function startJob(admin: any, userId: string, body: Record<string, unknown>) {
  const [{ data: aiSettings }, { data: scalpSettings }] = await Promise.all([
    admin.from('ai_settings').select('*').eq('user_id', userId).maybeSingle(),
    admin.from('scalp_settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  const params = resolveParams(aiSettings, scalpSettings, (body?.overrides ?? {}) as Record<string, unknown>);
  const isStock = params.assetClass === 'stocks';

  // A stock run needs Alpaca market-data credentials to fetch historical bars.
  let stockCreds: AlpacaCreds | null = null;
  if (isStock) {
    stockCreds = await loadDataCreds(admin, userId);
    if (!stockCreds) {
      return json({ success: false, error: 'stock backtests need Alpaca market-data credentials' }, 400);
    }
  }

  // An explicit universe lets every variant replay the SAME cached markets as the
  // baseline, so a comparison never drifts because the venue reordered by volume.
  const explicit = Array.isArray(body?.universe) ? (body.universe as unknown[]).map(String) : null;
  const universe = explicit && explicit.length >= 5
    ? explicit
      .map((productId) => ({ symbol: isStock ? productId.toUpperCase() : productId.split('-')[0], productId, volume: 0 }))
      .filter((p, i, arr) => arr.findIndex((q) => q.symbol === p.symbol) === i)
    : isStock
      ? await fetchStockUniverse(stockCreds!, params.universeSize)
      : await fetchUniverse(params.universeSize);
  if (universe.length < 5) return json({ success: false, error: 'could not resolve a tradable universe' }, 502);

  const endSec = Math.floor(Date.now() / 1000);
  const startSec = endSec - params.days * 86400;

  const { data: job, error } = await admin.from('backtest_jobs').insert({
    user_id: userId,
    label: String(body?.label ?? `${isStock ? 'Stocks' : 'Crypto'} replay ${params.days}d · ${universe.length} markets`),
    phase: 'syncing',
    asset_class: params.assetClass,
    universe: universe.map((u) => u.productId),
    period_days: params.days,
    range_start: new Date(startSec * 1000).toISOString(),
    range_end: new Date(endSec * 1000).toISOString(),
    params: params as unknown as Record<string, unknown>,
    progress_note: `Queued ${universe.length} markets for candle sync`,
  }).select().single();

  if (error) throw new Error(error.message);

  return json({ success: true, jobId: job.id, job });
}

// ── STATUS ───────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function statusJob(admin: any, userId: string, jobId: string) {
  const { data: job, error } = await admin.from('backtest_jobs')
    .select('*').eq('id', jobId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) return json({ success: false, error: 'job not found' }, 404);
  return json({ success: true, job });
}

// ── REPAIR ───────────────────────────────────────────────────────────────────
// Rewind a finished job to the start of the replay phase, keeping the cached candles
// and the already-computed tape timeline. Ticking it again rewrites every per-symbol
// row, which is how an incomplete result set is repopulated cheaply.

// deno-lint-ignore no-explicit-any
async function repairJob(admin: any, userId: string, jobId: string) {
  const { data: job, error } = await admin.from('backtest_jobs')
    .select('*').eq('id', jobId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) return json({ success: false, error: 'job not found' }, 404);

  const summary = (job.summary ?? {}) as Record<string, unknown>;
  delete summary.per_symbol;
  delete summary.trades;
  delete summary.portfolio;

  const { data: updated } = await admin.from('backtest_jobs').update({
    phase: 'replaying',
    replay_cursor: 0,
    symbols_replayed: 0,
    error: null,
    finished_at: null,
    summary,
    progress_note: 'Repair requested — replaying every market again from cached candles',
  }).eq('id', job.id).select().single();

  return json({ success: true, job: updated });
}

// ── TICK ─────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
async function tickJob(admin: any, userId: string, jobId: string) {
  const { data: job, error } = await admin.from('backtest_jobs')
    .select('*').eq('id', jobId).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!job) return json({ success: false, error: 'job not found' }, 404);
  if (job.phase === 'done' || job.phase === 'failed') return json({ success: true, job });

  try {
    if (job.phase === 'syncing' || job.phase === 'pending') return await tickSync(admin, job);
    if (job.phase === 'replaying') return await tickReplay(admin, job);
    return json({ success: true, job });
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    await admin.from('backtest_jobs')
      .update({ phase: 'failed', error: message, finished_at: new Date().toISOString() })
      .eq('id', jobId);
    return json({ success: false, error: message }, 500);
  }
}

const secs = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

// deno-lint-ignore no-explicit-any
async function tickSync(admin: any, job: any) {
  const universe: string[] = job.universe ?? [];
  const startSec = secs(job.range_start);
  const endSec = secs(job.range_end);
  const assetClass: 'crypto' | 'stocks' = job.asset_class === 'stocks' ? 'stocks' : 'crypto';
  let cursor: number = job.sync_cursor ?? 0;
  let loaded: number = Number(job.candles_loaded ?? 0);

  // Equity bars come from Alpaca and only exist during sessions, so a full window
  // is ~6.5 hours a weekday rather than 24/7 — the coverage test differs too.
  const stockCreds = assetClass === 'stocks' ? await loadDataCreds(admin, job.user_id) : null;
  if (assetClass === 'stocks' && !stockCreds) throw new Error('Alpaca market-data credentials unavailable');

  // Stock runs also cache index/volatility/sector context, which the equity tape
  // gate and relative-strength checks are computed from.
  const list = syncList(assetClass, universe);
  const tradedUniverse = new Set(universe);

  for (let n = 0; n < SYNC_PER_TICK && cursor < list.length; n++, cursor++) {
    const productId = list[cursor];
    const key = cacheKey(assetClass, productId);
    const grans = assetClass === 'stocks' && !tradedUniverse.has(productId)
      ? granularitiesForContext(productId, universe)
      : granularitiesFor(assetClass);
    for (const granularity of grans) {
      // Skip a market/granularity that is already cached for this window.
      const have = await cachedCount(admin, key, granularity, startSec, endSec);
      // Equities only print during the regular session: ~6.5h a weekday, so a
      // window holds far fewer bars than a 24/7 crypto window of the same length.
      const sessionShare = assetClass === 'stocks' ? (6.5 / 24) * (5 / 7) * 0.8 : 0.8;
      const expected = Math.floor((endSec - startSec) / GRANULARITY_SECONDS[granularity]) * sessionShare;
      if (have >= expected) { loaded += have; continue; }
      const bars = assetClass === 'stocks'
        ? await fetchStockHistory(stockCreds!, productId, granularity, startSec, endSec)
        : await fetchHistory(productId, granularity, startSec, endSec);
      if (bars.length) loaded += await cacheBars(admin, productId, granularity, bars, assetClass);
    }
  }

  const done = cursor >= list.length;
  const update: Record<string, unknown> = {
    sync_cursor: cursor,
    candles_loaded: loaded,
    progress_note: done
      ? `Candle sync complete — ${loaded.toLocaleString()} bars cached. Building the tape timeline.`
      : `Synced ${cursor}/${list.length} markets (${loaded.toLocaleString()} bars)`,
  };
  if (done) update.phase = 'replaying';

  const { data: updated } = await admin.from('backtest_jobs').update(update).eq('id', job.id).select().single();
  return json({ success: true, job: updated });
}

// deno-lint-ignore no-explicit-any
async function tickReplay(admin: any, job: any) {
  const universe: string[] = job.universe ?? [];
  const params = job.params as BacktestParams;
  const startSec = secs(job.range_start);
  const endSec = secs(job.range_end);
  const summary = (job.summary ?? {}) as Record<string, unknown>;
  const assetClass: 'crypto' | 'stocks' = job.asset_class === 'stocks' ? 'stocks' : 'crypto';

  // ── Step A: build the tape timeline once ────────────────────────────────────
  // Stocks resolve a per-SESSION gate from daily closes (index trend, breadth,
  // advance/decline, realized vol, VIX proxy) taken at the PRIOR session's close,
  // so a day's gate can never be informed by the day it is gating.
  if (!summary.tape && assetClass === 'stocks') {
    const dailyUniverse = new Map<string, Bar[]>();
    for (const productId of universe) {
      const bars = await loadBars(admin, cacheKey(assetClass, productId), 'ONE_DAY', startSec, endSec);
      if (bars.length) dailyUniverse.set(productId.toUpperCase(), bars);
    }
    const dailyContext = new Map<string, Bar[]>();
    for (const symbol of stockContextSymbols(universe)) {
      const bars = await loadBars(admin, cacheKey(assetClass, symbol), 'ONE_DAY', startSec, endSec);
      if (bars.length) dailyContext.set(symbol.toUpperCase(), bars);
    }

    const tape = buildStockTapeTimeline(dailyUniverse, dailyContext, params);
    summary.tape = {
      open_days: [...tape.openDays],
      regime_by_day: tape.regimeByDay,
      days_evaluated: tape.daysEvaluated,
      days_open: tape.daysOpen,
      open_share: tape.daysEvaluated ? tape.daysOpen / tape.daysEvaluated : 0,
      universe_size: dailyUniverse.size,
    };
    const { data: updated } = await admin.from('backtest_jobs').update({
      summary,
      progress_note: `Equity tape open on ${tape.daysOpen}/${tape.daysEvaluated} sessions — replaying markets`,
    }).eq('id', job.id).select().single();
    return json({ success: true, job: updated });
  }

  if (!summary.tape) {
    const hourlyBySymbol = new Map<string, Bar[]>();
    for (const productId of universe) {
      const bars = await loadBars(admin, cacheKey(assetClass, productId), 'ONE_HOUR', startSec, endSec);
      if (bars.length) hourlyBySymbol.set(productId, bars);
    }

    const tape = buildTapeTimeline(hourlyBySymbol, params);
    summary.tape = {
      open_hours: [...tape.open],
      hours_evaluated: tape.hoursEvaluated,
      hours_open: tape.hoursOpen,
      open_share: tape.hoursEvaluated ? tape.hoursOpen / tape.hoursEvaluated : 0,
      universe_size: hourlyBySymbol.size,
    };
    const { data: updated } = await admin.from('backtest_jobs').update({
      summary,
      progress_note: `Tape gate open in ${tape.hoursOpen}/${tape.hoursEvaluated} hours — replaying markets`,
    }).eq('id', job.id).select().single();
    return json({ success: true, job: updated });
  }

  const tapeSummary = summary.tape as Record<string, unknown>;
  const tapeOpen = new Set<number>((tapeSummary.open_hours as number[]) ?? []);
  const stockTape: StockTapeTimeline | null = assetClass === 'stocks'
    ? {
      openDays: new Set<string>((tapeSummary.open_days as string[]) ?? []),
      daysEvaluated: Number(tapeSummary.days_evaluated ?? 0),
      daysOpen: Number(tapeSummary.days_open ?? 0),
      regimeByDay: (tapeSummary.regime_by_day as Record<string, string>) ?? {},
    }
    : null;
  // Index/sector bars are shared across the markets replayed in this tick.
  const contextCache = new Map<string, IntradayIndex>();
  const positionValue = params.initialBalance
    * (params.maxCapitalUsagePct / 100)
    * (params.maxPositionSizePct / 100);

  const startCursor: number = job.replay_cursor ?? 0;
  const perSymbol = (summary.per_symbol ?? {}) as Record<string, unknown>;
  const allTrades: SimTrade[] = ((summary.trades ?? []) as SimTrade[]);

  // ── Claim this slice ────────────────────────────────────────────────────────
  // Two callers can poll the same job at once (the page and a script). The cursor
  // is advanced conditionally, so only one caller owns a slice and results are
  // never counted twice.
  const perTick = assetClass === 'stocks' ? STOCK_REPLAY_PER_TICK : REPLAY_PER_TICK;
  const claimTo = Math.min(startCursor + perTick, universe.length);
  const { data: claimed } = await admin.from('backtest_jobs')
    .update({ replay_cursor: claimTo })
    .eq('id', job.id)
    .eq('replay_cursor', startCursor)
    .select()
    .maybeSingle();
  if (!claimed) return json({ success: true, job, busy: true });

  let cursor = startCursor;

  // ── Step B: replay a slice of markets ───────────────────────────────────────
  for (; cursor < claimTo; cursor++) {
    const productId = universe[cursor];
    const symbol = assetClass === 'stocks' ? productId.toUpperCase() : productId.split('-')[0];
    const key = cacheKey(assetClass, productId);
    let result: SymbolReplay;
    if (assetClass === 'stocks') {
      const sectorEtf = SECTOR_ETF_BY_SYMBOL[symbol] ?? null;
      const [bars1m, bars1h, bars1d] = await Promise.all([
        loadBars(admin, key, 'ONE_MINUTE', startSec, endSec),
        loadBars(admin, key, 'ONE_HOUR', startSec, endSec),
        loadBars(admin, key, 'ONE_DAY', startSec, endSec),
      ]);
      result = replayStockSymbol({
        symbol,
        minuteBars: bars1m,
        hourlyBars: bars1h,
        dailyBars: bars1d,
        spy: await intradayContext(admin, assetClass, 'SPY', startSec, endSec, contextCache),
        sector: sectorEtf
          ? await intradayContext(admin, assetClass, sectorEtf, startSec, endSec, contextCache)
          : null,
        tape: stockTape!,
        params,
        positionValue,
      });
    } else {
      const bars5m = await loadBars(admin, key, 'FIVE_MINUTE', startSec, endSec);
      const bars1h = await loadBars(admin, key, 'ONE_HOUR', startSec, endSec);
      result = replaySymbol(symbol, bars5m, bars1h, tapeOpen, params, positionValue);
    }


    const closed = closedOnly(result.trades);
    const metrics = computeMetrics(result.trades, params.initialBalance);

    await deleteExisting(admin, job.run_group_id, symbol);
    const { error: symbolInsertError } = await admin.from('backtest_runs').insert(buildRunRow({
      userId: job.user_id,
      runGroupId: job.run_group_id,
      symbol,
      params,
      metrics,
      rangeStart: job.range_start,
      rangeEnd: job.range_end,
      extraDetails: {
        scope: 'per_symbol',
        product_id: productId,
        bars_evaluated: result.barsEvaluated,
        bars_stand_down: result.barsStandDown,
        bars_stand_down_share: result.barsEvaluated ? result.barsStandDown / result.barsEvaluated : 0,
        bars_no_data: result.barsNoData,
        playbook_veto_tally: result.vetoTally,
        signals_generated: result.trades.length,
        signals_unclosed: result.trades.length - closed.length,
        first_bar_at: result.firstBarAt ? new Date(result.firstBarAt * 1000).toISOString() : null,
        last_bar_at: result.lastBarAt ? new Date(result.lastBarAt * 1000).toISOString() : null,
        note: 'per-symbol rows are unconstrained by the portfolio slot cap; the PORTFOLIO row applies it',
      },
    }));
    // A silently dropped insert is how the first baseline lost half its per-symbol
    // rows. Persistence failure now fails the job instead of finishing incomplete.
    if (symbolInsertError) throw new Error(`persist ${symbol} failed: ${symbolInsertError.message}`);

    perSymbol[symbol] = {
      trades: metrics.trades,
      win_rate: Number(metrics.winRate.toFixed(2)),
      net_pnl: Number(metrics.netPnl.toFixed(2)),
      expectancy_usd: Number(metrics.expectancyUsd.toFixed(2)),
      profit_factor: Number(metrics.profitFactor.toFixed(2)),
      exit_breakdown: metrics.exitBreakdown,
      bars_stand_down_share: result.barsEvaluated ? result.barsStandDown / result.barsEvaluated : 0,
      playbook_veto_tally: result.vetoTally,
    };
    for (const t of closed) allTrades.push(t);
  }

  summary.per_symbol = perSymbol;
  summary.trades = allTrades;

  // ── Step C: finished — build the slot-capped portfolio aggregate ────────────
  if (cursor >= universe.length) {
    const { taken, skipped } = applySlotCap(allTrades, params.maxConcurrent);
    const portfolio = computeMetrics(taken, params.initialBalance);
    const unconstrained = computeMetrics(allTrades, params.initialBalance);

    const vetoTotals: Record<string, number> = {};
    for (const v of Object.values(perSymbol) as Record<string, unknown>[]) {
      const tally = (v?.playbook_veto_tally ?? {}) as Record<string, number>;
      for (const [k, n] of Object.entries(tally)) vetoTotals[k] = (vetoTotals[k] ?? 0) + n;
    }

    await deleteExisting(admin, job.run_group_id, 'PORTFOLIO');
    const { error: portfolioInsertError } = await admin.from('backtest_runs').insert(buildRunRow({
      userId: job.user_id,
      runGroupId: job.run_group_id,
      symbol: 'PORTFOLIO',
      params,
      metrics: portfolio,
      rangeStart: job.range_start,
      rangeEnd: job.range_end,
      extraDetails: {
        scope: 'portfolio',
        markets_tested: universe.length,
        universe: universe,
        position_value_usd: Number(positionValue.toFixed(2)),
        slot_cap: params.maxConcurrent,
        signals_skipped_no_slot: skipped,
        tape: {
          hours_evaluated: (summary.tape as Record<string, unknown>).hours_evaluated,
          hours_open: (summary.tape as Record<string, unknown>).hours_open,
          open_share: (summary.tape as Record<string, unknown>).open_share,
        },
        unconstrained: {
          trades: unconstrained.trades,
          win_rate: Number(unconstrained.winRate.toFixed(2)),
          net_pnl: Number(unconstrained.netPnl.toFixed(2)),
          expectancy_usd: Number(unconstrained.expectancyUsd.toFixed(2)),
          profit_factor: Number(unconstrained.profitFactor.toFixed(2)),
        },
        playbook_veto_tally: vetoTotals,
        per_symbol: perSymbol,
      },
    }));
    if (portfolioInsertError) throw new Error(`persist PORTFOLIO failed: ${portfolioInsertError.message}`);

    // Trade-level detail is not persisted on the job (it can be thousands of rows);
    // the per-symbol and portfolio run rows carry everything needed to compare runs.
    delete summary.trades;
    const { data: updated } = await admin.from('backtest_jobs').update({
      phase: 'done',
      replay_cursor: cursor,
      symbols_replayed: universe.length,
      summary: {
        ...summary,
        portfolio: {
          trades: portfolio.trades,
          win_rate: Number(portfolio.winRate.toFixed(2)),
          expectancy_usd: Number(portfolio.expectancyUsd.toFixed(2)),
          expectancy_pct: Number(portfolio.expectancyPct.toFixed(4)),
          profit_factor: Number(portfolio.profitFactor.toFixed(2)),
          max_drawdown: Number(portfolio.maxDrawdown.toFixed(2)),
          total_return: Number(portfolio.totalReturn.toFixed(2)),
          net_pnl: Number(portfolio.netPnl.toFixed(2)),
          exit_breakdown: portfolio.exitBreakdown,
        },
      },
      progress_note: `Complete — ${portfolio.trades} portfolio trades across ${universe.length} markets`,
      finished_at: new Date().toISOString(),
    }).eq('id', job.id).select().single();
    return json({ success: true, job: updated });
  }

  const { data: updated } = await admin.from('backtest_jobs').update({
    replay_cursor: cursor,
    symbols_replayed: cursor,
    summary,
    progress_note: `Replayed ${cursor}/${universe.length} markets`,
  }).eq('id', job.id).select().single();
  return json({ success: true, job: updated });
}

/** Results are rewritten, never appended, so a re-run of a slice cannot duplicate rows. */
// deno-lint-ignore no-explicit-any
async function deleteExisting(admin: any, runGroupId: string, symbol: string) {
  await admin.from('backtest_runs')
    .delete()
    .eq('symbol', symbol)
    .eq('strategy', 'live_engine_replay')
    .contains('details', { run_group_id: runGroupId });
}

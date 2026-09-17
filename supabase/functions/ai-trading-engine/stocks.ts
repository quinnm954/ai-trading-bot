// ═══════════════════════════════════════════════════════════════════════════════
// 📈 STOCK TRADING CYCLE (US equities via Alpaca)
//
// A self-contained cycle for accounts whose market_mode is 'stocks'. Kept in its
// own module so the crypto path in index.ts is not touched at all — crypto keeps
// running byte-for-byte as it does today.
//
// Reuses the shared brain (candle features, entry playbook, risk-manager gate,
// close-trade bookkeeping) and swaps only what is genuinely different about
// equities:
//   • market-hours gating instead of a 24/7 assumption
//   • equity-scaled exit geometry, solved commission-free
//   • an equity tape gate (index ETFs + universe breadth) instead of the crypto tape
//   • intraday-margin guardrails instead of the eliminated PDT day-trade count
// ═══════════════════════════════════════════════════════════════════════════════

import { computeCandleTechnicals, computeHtfContext } from '../_shared/candle-technicals.ts';
import { evaluateEntryPlaybook, type PlaybookTuning } from '../_shared/entry-playbook.ts';
import { loadAlpacaCreds, loadDataCreds } from '../_shared/alpaca-creds.ts';
import type { AlpacaBar, AlpacaCreds } from '../_shared/alpaca.ts';
import { getBars, getBarsMany, getSnapshots, placeOrder, waitForFill, getAccount, getAsset } from '../_shared/alpaca.ts';
import { getSessionState } from '../_shared/market-hours.ts';
import { fetchStockMarket } from '../_shared/stock-feed.ts';
import { evaluateStockTape, STOCK_TAPE_INDEX_SYMBOLS } from '../_shared/stock-tape.ts';
import {
  checkIntradayExposure,
  describeStockGeometry,
  solveStockGeometry,
  stockExitPricesForLong,
  type StockGeometry,
} from '../_shared/stock-geometry.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface StockCycleResult {
  status: string;
  assetClass: 'stocks';
  message: string;
  session?: unknown;
  tape?: unknown;
  candidates?: number;
  tradesOpened?: number;
  details?: unknown;
}

/** Turn Alpaca bars into the RawCandle shape the shared feature builder expects. */
function toRawCandles(bars: AlpacaBar[]) {
  return bars.map((b) => ({
    start: Math.floor(Date.parse(b.t) / 1000),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
    volume: b.v,
  }));
}

async function logRiskEvent(
  supabase: Supa,
  userId: string,
  eventType: string,
  severity: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  try {
    await supabase.from('risk_events').insert({
      user_id: userId,
      event_type: eventType,
      severity,
      message,
      details: { asset_class: 'stocks', ...details },
    });
  } catch (e) {
    console.error('risk_events insert failed:', (e as Error).message);
  }
}

async function logDecision(
  supabase: Supa,
  userId: string,
  reasoning: string,
  extra: Record<string, unknown> = {},
) {
  try {
    await supabase.from('ai_decisions').insert({
      user_id: userId,
      decision_type: 'stock_cycle',
      reasoning,
      market_type: undefined,
      ...extra,
    });
  } catch (_e) {
    // decisions are advisory; never block a cycle on a log failure
  }
}

export async function runStockCycle(
  supabase: Supa,
  userId: string,
  // deno-lint-ignore no-explicit-any
  settings: any,
): Promise<StockCycleResult> {
  const isPaperMode = settings.trading_mode !== 'live';

  // ── 1. CREDENTIALS ─────────────────────────────────────────────────────────
  // Data can fall back to project keys; ORDERS require the user's own keys.
  const dataCreds = await loadDataCreds(supabase, userId);
  const orderCreds: AlpacaCreds | null = isPaperMode
    ? null // paper fills are simulated locally, exactly as the crypto paper path does
    : await loadAlpacaCreds(supabase, userId);

  if (!dataCreds) {
    const message = 'Stock mode is on but no Alpaca account is connected — cannot read equity market data.';
    await logRiskEvent(supabase, userId, 'stand_down', 'warning', message);
    return { status: 'no_credentials', assetClass: 'stocks', message };
  }
  if (!isPaperMode && !orderCreds) {
    const message = 'Live stock trading needs your own Alpaca API keys connected.';
    await logRiskEvent(supabase, userId, 'stand_down', 'warning', message);
    return { status: 'no_live_credentials', assetClass: 'stocks', message };
  }

  // ── 2. SESSION GATE — stocks are not 24/7 ──────────────────────────────────
  const session = await getSessionState(dataCreds);
  if (!session.entriesAllowed) {
    const message = `📈 Stand-down (equities): ${session.label}`;
    console.log(message);
    await logRiskEvent(supabase, userId, 'stand_down', 'info', message, { session });
    return { status: 'market_closed', assetClass: 'stocks', message, session };
  }

  // ── 3. ACCOUNT / BALANCE ───────────────────────────────────────────────────
  let equity = 0;
  let cash = 0;
  let accountIsCash = settings.stock_cash_account !== false;

  if (isPaperMode) {
    const { data: paper } = await supabase
      .from('paper_account')
      .select('balance, initial_balance')
      .eq('user_id', userId)
      .maybeSingle();
    cash = Number(paper?.balance) || 0;
    const reinvest = settings.reinvest_profits === true;
    const initial = Number(paper?.initial_balance) || 0;
    equity = reinvest || initial <= 0 ? cash : Math.min(cash, initial);
  } else {
    const account = await getAccount(orderCreds!);
    if (!account) {
      const message = 'Could not read the Alpaca account — standing down this cycle.';
      await logRiskEvent(supabase, userId, 'stand_down', 'warning', message);
      return { status: 'account_unavailable', assetClass: 'stocks', message };
    }
    if (account.tradingBlocked || account.accountBlocked) {
      const message = `Alpaca account is blocked from trading (status ${account.status}).`;
      await logRiskEvent(supabase, userId, 'stand_down', 'critical', message);
      return { status: 'account_blocked', assetClass: 'stocks', message };
    }
    equity = account.equity;
    cash = account.cash;
    accountIsCash = account.accountType === 'cash';

    await supabase
      .from('live_account')
      .update({
        provider: 'alpaca',
        balance: account.cash,
        buying_power: account.buyingPower,
        equity: account.equity,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);
  }

  if (equity <= 0) {
    const message = 'No capital available in the stock account.';
    await logRiskEvent(supabase, userId, 'stand_down', 'warning', message);
    return { status: 'no_capital', assetClass: 'stocks', message };
  }

  // ── 4. OPEN POSITIONS / SLOTS ──────────────────────────────────────────────
  const { data: openRows } = await supabase
    .from('positions')
    .select('symbol, quantity, avg_entry_price, current_price')
    .eq('user_id', userId)
    .eq('is_paper', isPaperMode)
    .eq('market_type', 'stocks');

  const openPositions = openRows ?? [];
  const heldSymbols = new Set(openPositions.map((p: { symbol: string }) => String(p.symbol).toUpperCase()));
  const openExposureUsd = openPositions.reduce(
    (sum: number, p: { quantity: number; avg_entry_price: number; current_price: number | null }) =>
      sum + (Number(p.quantity) || 0) * (Number(p.current_price) || Number(p.avg_entry_price) || 0),
    0,
  );

  const maxSlots = Number(settings.max_concurrent_trades) || 12;
  const remainingSlots = Math.max(0, maxSlots - openPositions.length);
  if (remainingSlots === 0) {
    const message = `All ${maxSlots} stock slots are in use — holding.`;
    console.log(message);
    return { status: 'slots_full', assetClass: 'stocks', message, session };
  }

  // ── 5. MARKET FEED + EQUITY TAPE GATE ──────────────────────────────────────
  const feed = await fetchStockMarket(dataCreds, { limit: 60 });
  if (feed.quotes.length === 0) {
    const message = 'No live equity quotes this cycle — standing down rather than trading blind.';
    await logRiskEvent(supabase, userId, 'stand_down', 'warning', message);
    return { status: 'no_market_data', assetClass: 'stocks', message, session };
  }

  const indexChanges = feed.indexChanges.length > 0
    ? feed.indexChanges
    : feed.quotes.filter((q) => STOCK_TAPE_INDEX_SYMBOLS.includes(q.symbol)).map((q) => q.change24h);
  const tape = evaluateStockTape(indexChanges, feed.quotes.map((q) => q.change24h));

  if (!tape.rising) {
    const message = `📈 Stand-down (equities): ${tape.label}`;
    console.log(message);
    await logRiskEvent(supabase, userId, 'stand_down', 'info', message, { tape });
    return { status: 'tape_stand_down', assetClass: 'stocks', message, session, tape };
  }

  // ── 6. DAILY LOSS CIRCUIT BREAKER ──────────────────────────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const { data: todaysTrades } = await supabase
    .from('trades')
    .select('pnl, exit_reason')
    .eq('user_id', userId)
    .eq('is_paper', isPaperMode)
    .eq('market_type', 'stocks')
    .gte('created_at', todayStart.toISOString());

  const todaysLoss = (todaysTrades ?? []).reduce(
    (sum: number, t: { pnl: number | null }) => (Number(t.pnl) < 0 ? sum + Math.abs(Number(t.pnl)) : sum),
    0,
  );
  const maxDailyLossUsd = (Number(settings.max_daily_loss) || 3) / 100 * (equity + openExposureUsd);
  if (todaysLoss >= maxDailyLossUsd) {
    const message = `📈 Stand-down (equities): daily loss $${todaysLoss.toFixed(2)} reached the $${maxDailyLossUsd.toFixed(2)} limit.`;
    await logRiskEvent(supabase, userId, 'stand_down', 'warning', message, { todaysLoss, maxDailyLossUsd });
    return { status: 'daily_loss_limit', assetClass: 'stocks', message, session, tape };
  }

  // ── 7. CANDIDATE SCAN ──────────────────────────────────────────────────────
  const tuning: PlaybookTuning = {
    minScore: Number(settings.playbook_min_score) || undefined,
    minVolumeRatio: Number(settings.playbook_min_volume_ratio) || undefined,
    maxPercentB: Number(settings.playbook_max_percent_b) || undefined,
    rsiMax: Number(settings.playbook_rsi_max) || undefined,
    maxChase5m: Number(settings.playbook_max_chase_5m_pct) || undefined,
  };

  const geometryBounds = {
    minStopPct: Number(settings.stock_min_stop_pct) || undefined,
    maxStopPct: Number(settings.stock_max_stop_pct) || undefined,
    atrMult: Number(settings.stock_stop_atr_mult) || undefined,
  };

  // Only names not already held, ranked by dollar volume, and only the ones that
  // are actually moving up today — the same "no falling knives" discipline crypto uses.
  const shortlist = feed.quotes
    .filter((q) => !heldSymbols.has(q.symbol) && !STOCK_TAPE_INDEX_SYMBOLS.includes(q.symbol))
    .filter((q) => q.change1h > 0 || q.change24h > 0)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 25);

  if (shortlist.length === 0) {
    const message = 'No rising equity candidates this cycle.';
    console.log(message);
    return { status: 'no_candidates', assetClass: 'stocks', message, session, tape };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const fiveMinStart = new Date(Date.now() - 3 * 86400_000).toISOString();
  const hourlyStart = new Date(Date.now() - 30 * 86400_000).toISOString();

  const [fiveMinBars, hourlyBars] = await Promise.all([
    getBarsMany(dataCreds, shortlist.map((q) => q.symbol), '5Min', fiveMinStart, undefined, 5),
    getBarsMany(dataCreds, shortlist.map((q) => q.symbol), '1Hour', hourlyStart, undefined, 5),
  ]);

  interface Candidate {
    symbol: string;
    price: number;
    geo: StockGeometry;
    score: number;
    grade: string;
    setupKey: string;
    summary: string;
    strategy: string;
  }

  const candidates: Candidate[] = [];
  const rejected: Array<{ symbol: string; reason: string }> = [];

  for (const quote of shortlist) {
    const intraday = fiveMinBars[quote.symbol] ?? [];
    const hourly = hourlyBars[quote.symbol] ?? [];
    if (intraday.length < 40 || hourly.length < 30) {
      rejected.push({ symbol: quote.symbol, reason: 'not enough bar history' });
      continue;
    }

    const tech = computeCandleTechnicals(toRawCandles(intraday), nowSeconds);
    const htf = computeHtfContext(toRawCandles(hourly), nowSeconds);
    if (!tech) {
      rejected.push({ symbol: quote.symbol, reason: 'candle features unavailable' });
      continue;
    }

    const geo = solveStockGeometry(htf?.swingAtrPct, Number(settings.stock_max_stop_pct), geometryBounds);
    if (!geo.reachable) {
      rejected.push({ symbol: quote.symbol, reason: `target +${geo.takeProfitPct.toFixed(2)}% unreachable for its range` });
      continue;
    }

    const verdict = evaluateEntryPlaybook({
      symbol: quote.symbol,
      change5m: tech.change5m,
      change15m: tech.change15m,
      change1h: htf?.change1h ?? quote.change1h,
      change24h: quote.change24h,
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
      swingAtrPct: htf?.swingAtrPct ?? tech.swingAtrPct,
      volClass: tech.volClass,
      supportContext: tech.supportContext,
      distanceToSupportPct: tech.distanceToSupportPct,
      htfAboveEma: htf?.htfAboveEma,
      htfSlopePct: htf?.htfSlopePct,
      regime: 'equities',
      strategy: 'stock_momentum',
      targetPct: geo.takeProfitPct,
      tuning,
    });

    if (!verdict.passed) {
      rejected.push({ symbol: quote.symbol, reason: verdict.vetoes[0] ?? `score ${verdict.score} below floor` });
      continue;
    }

    candidates.push({
      symbol: quote.symbol,
      price: quote.price,
      geo,
      score: verdict.score,
      grade: verdict.grade,
      setupKey: verdict.setupKey,
      summary: verdict.summary,
      strategy: 'stock_momentum',
    });
  }

  console.log(`📈 Equity scan: ${candidates.length} pass / ${rejected.length} rejected of ${shortlist.length}`);

  if (candidates.length === 0) {
    const message = `No equity setup cleared the playbook (${rejected.slice(0, 3).map((r) => `${r.symbol}: ${r.reason}`).join('; ')})`;
    await logDecision(supabase, userId, message);
    return { status: 'no_qualified_setup', assetClass: 'stocks', message, session, tape, candidates: 0 };
  }

  candidates.sort((a, b) => b.score - a.score);

  // ── 8. SIZING + EXECUTION ──────────────────────────────────────────────────
  const maxPositionPct = Number(settings.max_position_size) || 15;
  const maxCapitalPct = Number(settings.max_capital_usage) || 85;
  const capitalCeiling = equity * (maxCapitalPct / 100);
  let deployed = openExposureUsd;
  let tradesOpened = 0;
  const opened: Array<Record<string, unknown>> = [];

  for (const candidate of candidates.slice(0, remainingSlots)) {
    const targetUsd = Math.min(equity * (maxPositionPct / 100), Math.max(0, capitalCeiling - deployed), cash);
    if (targetUsd < 25) {
      console.log(`📈 ${candidate.symbol}: position budget $${targetUsd.toFixed(2)} too small — stopping.`);
      break;
    }

    // Intraday-margin guardrail (replaces the eliminated PDT day-trade count).
    const exposure = checkIntradayExposure({
      equity,
      openExposureUsd: deployed,
      newPositionUsd: targetUsd,
      ceilingPct: Number(settings.stock_max_intraday_exposure_pct) || 50,
      cashAccount: accountIsCash,
      cashAvailable: cash,
    });
    if (!exposure.allowed) {
      const message = `📈 ${candidate.symbol} skipped: ${exposure.reason}`;
      console.log(message);
      await logRiskEvent(supabase, userId, 'intraday_margin_guard', 'info', message, { exposure });
      break;
    }

    const asset = orderCreds ? await getAsset(orderCreds, candidate.symbol) : null;
    const fractionable = asset?.fractionable ?? true;
    let quantity = fractionable
      ? Math.floor((targetUsd / candidate.price) * 1e6) / 1e6
      : Math.floor(targetUsd / candidate.price);
    let fillPrice = candidate.price;

    if (quantity <= 0) {
      console.log(`📈 ${candidate.symbol}: one share ($${candidate.price.toFixed(2)}) exceeds the budget — skipping.`);
      continue;
    }

    if (!isPaperMode) {
      const order = await placeOrder(orderCreds!, {
        symbol: candidate.symbol,
        side: 'buy',
        qty: quantity,
        fractionable,
        timeInForce: 'day',
        clientOrderId: `titan-${userId.slice(0, 8)}-${candidate.symbol}-${Date.now()}`,
      });
      if (!order) {
        console.error(`📈 Alpaca rejected the ${candidate.symbol} order.`);
        await logRiskEvent(supabase, userId, 'order_rejected', 'warning', `Alpaca rejected the ${candidate.symbol} buy order.`);
        continue;
      }
      const filled = await waitForFill(orderCreds!, order.id);
      if (!filled || filled.status !== 'filled' || !filled.filledAvgPrice) {
        console.error(`📈 ${candidate.symbol} order did not fill (${filled?.status ?? 'unknown'}).`);
        continue;
      }
      quantity = filled.filledQty;
      fillPrice = filled.filledAvgPrice;
    }

    const { stopLossPrice, takeProfitPrice } = stockExitPricesForLong(fillPrice, candidate.geo);
    const positionValue = quantity * fillPrice;

    const { error: tradeError } = await supabase.from('trades').insert({
      user_id: userId,
      symbol: candidate.symbol,
      side: 'buy',
      quantity,
      entry_price: fillPrice,
      status: 'open',
      market_type: 'stocks',
      strategy: 'custom',
      is_paper: isPaperMode,
      confidence: candidate.score,
      score: candidate.score,
      setup_key: candidate.setupKey,
      playbook_score: candidate.score,
      playbook_grade: candidate.grade,
      stop_loss_price: stopLossPrice,
      take_profit_price: takeProfitPrice,
      risk_reward: candidate.geo.netRewardRisk,
      // Alpaca equities are commission-free — only the spread allowance is booked.
      fees_estimate: positionValue * (candidate.geo.costPct / 100),
      entry_reasoning: candidate.summary,
      ai_reasoning: `${candidate.summary} | ${describeStockGeometry(candidate.geo)}`,
    });
    if (tradeError) console.error('stock trade insert failed:', tradeError.message);

    const { error: posError } = await supabase.from('positions').insert({
      user_id: userId,
      symbol: candidate.symbol,
      side: 'buy',
      quantity,
      avg_entry_price: fillPrice,
      current_price: fillPrice,
      market_type: 'stocks',
      strategy: 'custom',
      is_paper: isPaperMode,
      stop_loss_pct: candidate.geo.stopLossPct,
      take_profit_pct: candidate.geo.takeProfitPct,
      max_hold_minutes: candidate.geo.holdMinutes,
      trailing_enabled: false,
      partial_tp_done: false,
      mirror_only: false,
    });
    if (posError) console.error('stock position insert failed:', posError.message);

    if (isPaperMode) {
      await supabase.rpc('adjust_paper_balance', { p_user_id: userId, p_delta: -positionValue });
      cash -= positionValue;
    } else {
      cash -= positionValue;
    }

    deployed += positionValue;
    tradesOpened++;
    opened.push({
      symbol: candidate.symbol,
      quantity,
      price: fillPrice,
      value: positionValue,
      stop: stopLossPrice,
      target: takeProfitPrice,
      geometry: describeStockGeometry(candidate.geo),
      grade: candidate.grade,
    });

    console.log(`📈 OPENED ${candidate.symbol}: ${quantity} @ $${fillPrice.toFixed(2)} — ${describeStockGeometry(candidate.geo)}`);
  }

  const message = tradesOpened > 0
    ? `Opened ${tradesOpened} equity position${tradesOpened === 1 ? '' : 's'} (${session.label}).`
    : 'Equity setups qualified but none could be sized within the account limits.';

  await logDecision(supabase, userId, `📈 Equity cycle: ${message} ${tape.label}`);

  return {
    status: tradesOpened > 0 ? 'traded' : 'no_entry',
    assetClass: 'stocks',
    message,
    session,
    tape,
    candidates: candidates.length,
    tradesOpened,
    details: { opened, rejected: rejected.slice(0, 8) },
  };
}

/** Latest equity prices for open stock positions — used by the exit engine. */
export async function fetchStockPrices(
  creds: AlpacaCreds,
  symbols: string[],
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  const snaps = await getSnapshots(creds, symbols);
  const out: Record<string, number> = {};
  for (const s of snaps) out[s.symbol] = s.price;
  return out;
}

export { getBars };

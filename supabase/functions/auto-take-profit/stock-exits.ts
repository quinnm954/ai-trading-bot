// ── STOCK EXIT ENGINE ────────────────────────────────────────────────────────
// Exits for equity positions. Separate from the crypto exit loop so crypto keeps
// its exact behaviour, and because equities differ in three ways that matter:
//   • prices only move while the session is open, but exits must still be checked
//     so a gap-down is handled at the next open
//   • no commission — P&L is booked net of a small spread allowance only
//   • the max-hold window is expressed in trading minutes, not wall clock
//
// Each position exits on its own stored levels (stop_loss_pct / take_profit_pct),
// which the stock geometry solver wrote at entry.

import { closeOpenTrade } from '../_shared/close-trade.ts';
import { loadDataCreds } from '../_shared/alpaca-creds.ts';
import { loadAlpacaCreds } from '../_shared/alpaca-creds.ts';
import { getSnapshots, placeOrder, waitForFill, getAsset } from '../_shared/alpaca.ts';
import { getSessionState } from '../_shared/market-hours.ts';
import { roundTripCostPct } from '../_shared/asset-class.ts';
import { STOCK_STOP_MAX_PCT, STOCK_TP_FLOOR_PCT } from '../_shared/stock-geometry.ts';

const COST_PCT = roundTripCostPct('stocks');

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface StockExitSummary {
  checked: number;
  takeProfits: number;
  stopLosses: number;
  timeExits: number;
  skipped: string | null;
}

export async function processStockPositions(
  supabase: Supa,
  userId: string,
  isPaperMode: boolean,
  // deno-lint-ignore no-explicit-any
  positions: any[],
): Promise<StockExitSummary> {
  const empty: StockExitSummary = { checked: 0, takeProfits: 0, stopLosses: 0, timeExits: 0, skipped: null };
  if (!positions || positions.length === 0) return empty;

  const dataCreds = await loadDataCreds(supabase, userId);
  if (!dataCreds) return { ...empty, checked: positions.length, skipped: 'no Alpaca credentials' };

  const orderCreds = isPaperMode ? null : await loadAlpacaCreds(supabase, userId);
  if (!isPaperMode && !orderCreds) {
    return { ...empty, checked: positions.length, skipped: 'no live Alpaca credentials' };
  }

  const session = await getSessionState(dataCreds);

  const symbols = [...new Set(positions.map((p) => String(p.symbol).toUpperCase()))];
  const snaps = await getSnapshots(dataCreds, symbols);
  const prices: Record<string, number> = {};
  for (const s of snaps) prices[s.symbol] = s.price;

  let takeProfits = 0;
  let stopLosses = 0;
  let timeExits = 0;

  for (const position of positions) {
    const symbol = String(position.symbol).toUpperCase();
    const price = prices[symbol];
    const entry = Number(position.avg_entry_price) || 0;
    const quantity = Number(position.quantity) || 0;
    if (!price || price <= 0 || entry <= 0 || quantity <= 0) continue;

    const grossPct = ((price - entry) / entry) * 100;
    const netPct = grossPct - COST_PCT;

    // Keep the mark fresh even when no exit fires, so the dashboard is accurate.
    await supabase
      .from('positions')
      .update({
        current_price: price,
        unrealized_pnl: (price - entry) * quantity - entry * quantity * (COST_PCT / 100),
        peak_pnl_percent: Math.max(Number(position.peak_pnl_percent) || 0, grossPct),
        updated_at: new Date().toISOString(),
      })
      .eq('id', position.id);

    const takeProfitPct = Number(position.take_profit_pct) > 0
      ? Number(position.take_profit_pct)
      : STOCK_TP_FLOOR_PCT;
    const stopLossPct = Number(position.stop_loss_pct) > 0
      ? Number(position.stop_loss_pct)
      : STOCK_STOP_MAX_PCT;
    const maxHoldMinutes = Number(position.max_hold_minutes) || 0;
    const heldMinutes = position.created_at
      ? (Date.now() - Date.parse(position.created_at)) / 60000
      : 0;

    let exitReason: string | null = null;
    if (grossPct >= takeProfitPct) exitReason = 'take_profit';
    else if (grossPct <= -stopLossPct) exitReason = 'stop_loss';
    else if (maxHoldMinutes > 0 && heldMinutes >= maxHoldMinutes) exitReason = 'max_hold_reached';

    if (!exitReason) continue;

    // Orders can only be sent while the market is open. A triggered level found
    // outside the session is held and re-checked at the next open, which is
    // exactly what a real equity account experiences.
    if (!session.isOpen) {
      console.log(`📈 ${symbol} hit ${exitReason} but the market is closed — will exit at the next open.`);
      continue;
    }

    let exitPrice = price;

    if (!isPaperMode) {
      const asset = await getAsset(orderCreds!, symbol);
      const order = await placeOrder(orderCreds!, {
        symbol,
        side: 'sell',
        qty: quantity,
        fractionable: asset?.fractionable ?? true,
        timeInForce: 'day',
        clientOrderId: `titan-exit-${symbol}-${Date.now()}`,
      });
      if (!order) {
        console.error(`📈 Alpaca rejected the ${symbol} sell order — position kept open.`);
        continue;
      }
      const filled = await waitForFill(orderCreds!, order.id);
      if (!filled || filled.status !== 'filled' || !filled.filledAvgPrice) {
        console.error(`📈 ${symbol} exit did not fill (${filled?.status ?? 'unknown'}) — position kept open.`);
        continue;
      }
      exitPrice = filled.filledAvgPrice;
    }

    const grossPnl = (exitPrice - entry) * quantity;
    // Commission-free: only the spread/slippage allowance is deducted.
    const costUsd = entry * quantity * (COST_PCT / 100);
    const pnl = grossPnl - costUsd;

    await closeOpenTrade(supabase, {
      userId,
      symbol,
      isPaper: isPaperMode,
      side: 'buy',
      exitPrice,
      pnl,
      exitReason,
      quantity,
      entryPrice: entry,
      marketType: 'stocks',
      strategy: position.strategy ?? null,
      extra: { fees_estimate: costUsd },
    });

    await supabase.from('positions').delete().eq('id', position.id);

    if (isPaperMode) {
      await supabase.rpc('adjust_paper_balance', {
        p_user_id: userId,
        p_delta: entry * quantity + pnl,
      });
    }

    if (exitReason === 'take_profit') takeProfits++;
    else if (exitReason === 'stop_loss') stopLosses++;
    else timeExits++;

    console.log(
      `📈 EXIT ${symbol} ${exitReason}: gross ${grossPct.toFixed(2)}% / net ${netPct.toFixed(2)}% → $${pnl.toFixed(2)}`,
    );
  }

  return {
    checked: positions.length,
    takeProfits,
    stopLosses,
    timeExits,
    skipped: session.isOpen ? null : 'market closed — exits deferred to next open',
  };
}

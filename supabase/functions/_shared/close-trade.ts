// Single source of truth for closing a trade row when a position exits.
//
// Why this exists: several exit paths used to INSERT a brand-new "closed" trade
// while the original entry row was left open. The position-delete trigger then
// flipped that entry row to 'cancelled' with no P&L, so every exit produced two
// records: a phantom cancelled entry and a detached exit. Trade counts, win rate
// and expectancy all read wrong. Other paths bulk-updated every open trade for a
// symbol, so two positions in the same coin got the same exit price and P&L.
//
// closeOpenTrade() always resolves ONE specific open trade row (oldest match) and
// updates it in place, stamping closed_at and duration_seconds. If no open row
// exists (legacy / broker-synced holdings) it inserts a complete closed record.

export interface CloseTradeOpts {
  userId: string;
  symbol: string;
  isPaper: boolean;
  side?: 'buy' | 'sell';
  exitPrice: number;
  pnl: number;
  exitReason: string;
  // Used only when a fallback insert is needed.
  quantity?: number;
  entryPrice?: number;
  marketType?: string;
  strategy?: string | null;
  aiReasoning?: string | null;
  // Extra columns to persist (fees_estimate, slippage_estimate, stop_loss_price, ...)
  extra?: Record<string, unknown>;
}

// deno-lint-ignore no-explicit-any
export async function closeOpenTrade(supabase: any, opts: CloseTradeOpts): Promise<'updated' | 'inserted'> {
  const closedAt = new Date();

  let query = supabase
    .from('trades')
    .select('id, created_at')
    .eq('user_id', opts.userId)
    .eq('symbol', opts.symbol)
    .eq('is_paper', opts.isPaper)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(1);

  if (opts.side) query = query.eq('side', opts.side);

  const { data: openRows } = await query;
  const openTrade = openRows?.[0];

  if (openTrade) {
    const durationSeconds = Math.max(
      0,
      Math.round((closedAt.getTime() - new Date(openTrade.created_at).getTime()) / 1000),
    );
    await supabase
      .from('trades')
      .update({
        status: 'closed',
        exit_price: opts.exitPrice,
        pnl: opts.pnl,
        exit_reason: opts.exitReason,
        closed_at: closedAt.toISOString(),
        duration_seconds: durationSeconds,
        ...(opts.extra || {}),
      })
      .eq('id', openTrade.id);
    return 'updated';
  }

  await supabase.from('trades').insert({
    user_id: opts.userId,
    symbol: opts.symbol,
    side: opts.side || 'buy',
    quantity: opts.quantity ?? 0,
    entry_price: opts.entryPrice ?? 0,
    exit_price: opts.exitPrice,
    pnl: opts.pnl,
    status: 'closed',
    market_type: opts.marketType || 'crypto',
    strategy: opts.strategy ?? null,
    is_paper: opts.isPaper,
    exit_reason: opts.exitReason,
    ai_reasoning: opts.aiReasoning ?? null,
    closed_at: closedAt.toISOString(),
    duration_seconds: 0,
    ...(opts.extra || {}),
  });
  return 'inserted';
}

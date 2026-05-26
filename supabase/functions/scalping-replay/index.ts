// Scalping paper replay — runs the live bot's scalping logic over recent
// Binance 1-minute klines so you can sanity-check before flipping live paper on.
// No persistence, no auth required, no DB writes.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface ReplayRequest {
  symbol?: string;        // e.g. "BTCUSDT"
  lookbackMinutes?: number; // default 1440 (24h), max 10080 (7d)
}

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface SimTrade {
  entryTime: string;
  exitTime: string;
  entry: number;
  exit: number;
  pnlPct: number;
  holdMinutes: number;
  reason: 'trailing_stop' | 'hard_stop' | 'end_of_window';
}

// Same constants as the live scalping logic.
const PEAK_GAIN_TRIGGER = 0.01;   // 1% — arms trailing stop
const TRAIL_DROP_FROM_PEAK = 0.015; // 1.5% drop from peak triggers exit
const HARD_STOP_LOSS = 0.02;      // 2% hard stop
const MIN_MOMENTUM = 0.005;       // 0.5% — entry trigger over short window
const ENTRY_LOOKBACK_BARS = 5;    // momentum measured over last 5 mins
const FEE_ROUND_TRIP = 0.002;     // 0.2% round-trip fee assumption
const COOLDOWN_BARS = 6;          // 6-min cooldown after exit

async function fetchKlines(symbol: string, minutes: number): Promise<Kline[]> {
  const limit = Math.min(minutes, 1000);
  const chunks: Kline[] = [];
  let remaining = minutes;
  let endTime: number | undefined;

  while (remaining > 0) {
    const chunkLimit = Math.min(remaining, 1000);
    const url = new URL('https://api.binance.com/api/v3/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', '1m');
    url.searchParams.set('limit', String(chunkLimit));
    if (endTime) url.searchParams.set('endTime', String(endTime));

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Binance error ${res.status}: ${await res.text()}`);
    }
    const raw = (await res.json()) as unknown[][];
    if (raw.length === 0) break;

    const parsed: Kline[] = raw.map((k) => ({
      openTime: k[0] as number,
      open: parseFloat(k[1] as string),
      high: parseFloat(k[2] as string),
      low: parseFloat(k[3] as string),
      close: parseFloat(k[4] as string),
    }));
    chunks.unshift(...parsed);
    endTime = parsed[0].openTime - 1;
    remaining -= parsed.length;
    if (parsed.length < chunkLimit) break;
  }
  // Sort ascending by time and dedupe
  const seen = new Set<number>();
  return chunks
    .filter((k) => {
      if (seen.has(k.openTime)) return false;
      seen.add(k.openTime);
      return true;
    })
    .sort((a, b) => a.openTime - b.openTime);
}

function simulate(bars: Kline[]): {
  trades: SimTrade[];
  metrics: {
    totalTrades: number;
    winRate: number;
    totalPnlPct: number;
    avgPnlPct: number;
    maxDrawdownPct: number;
    avgHoldMinutes: number;
  };
} {
  const trades: SimTrade[] = [];
  let inPos = false;
  let entryPrice = 0;
  let entryIdx = 0;
  let peakPnl = 0;
  let cooldownUntil = -1;

  for (let i = ENTRY_LOOKBACK_BARS; i < bars.length; i++) {
    const bar = bars[i];

    if (!inPos) {
      if (i < cooldownUntil) continue;
      // Entry: momentum over last N bars >= MIN_MOMENTUM
      const refPrice = bars[i - ENTRY_LOOKBACK_BARS].close;
      const momentum = (bar.close - refPrice) / refPrice;
      // Skip parabolic >3% in 5min (likely top)
      if (momentum >= MIN_MOMENTUM && momentum < 0.03) {
        inPos = true;
        entryPrice = bar.close;
        entryIdx = i;
        peakPnl = 0;
      }
      continue;
    }

    // In position — check exit conditions on this bar's high/low
    const highPnl = (bar.high - entryPrice) / entryPrice;
    const lowPnl = (bar.low - entryPrice) / entryPrice;
    if (highPnl > peakPnl) peakPnl = highPnl;

    let exitPrice: number | null = null;
    let reason: SimTrade['reason'] | null = null;

    // Hard stop hit intra-bar
    if (lowPnl <= -HARD_STOP_LOSS) {
      exitPrice = entryPrice * (1 - HARD_STOP_LOSS);
      reason = 'hard_stop';
    }
    // Trailing stop: peak gain reached trigger AND current price dropped 1.5% from peak
    else if (peakPnl >= PEAK_GAIN_TRIGGER) {
      const trailExitPnl = peakPnl - TRAIL_DROP_FROM_PEAK;
      if (lowPnl <= trailExitPnl) {
        exitPrice = entryPrice * (1 + trailExitPnl);
        reason = 'trailing_stop';
      }
    }

    if (exitPrice !== null && reason !== null) {
      const grossPnlPct = (exitPrice - entryPrice) / entryPrice;
      const netPnlPct = grossPnlPct - FEE_ROUND_TRIP;
      trades.push({
        entryTime: new Date(bars[entryIdx].openTime).toISOString(),
        exitTime: new Date(bar.openTime).toISOString(),
        entry: entryPrice,
        exit: exitPrice,
        pnlPct: netPnlPct * 100,
        holdMinutes: i - entryIdx,
        reason,
      });
      inPos = false;
      cooldownUntil = i + COOLDOWN_BARS;
    }
  }

  // Close any dangling position at last close
  if (inPos) {
    const last = bars[bars.length - 1];
    const grossPnlPct = (last.close - entryPrice) / entryPrice;
    const netPnlPct = grossPnlPct - FEE_ROUND_TRIP;
    trades.push({
      entryTime: new Date(bars[entryIdx].openTime).toISOString(),
      exitTime: new Date(last.openTime).toISOString(),
      entry: entryPrice,
      exit: last.close,
      pnlPct: netPnlPct * 100,
      holdMinutes: bars.length - 1 - entryIdx,
      reason: 'end_of_window',
    });
  }

  // Aggregate metrics
  const totalTrades = trades.length;
  const wins = trades.filter((t) => t.pnlPct > 0).length;
  const winRate = totalTrades ? (wins / totalTrades) * 100 : 0;
  const totalPnlPct = trades.reduce((s, t) => s + t.pnlPct, 0);
  const avgPnlPct = totalTrades ? totalPnlPct / totalTrades : 0;
  const avgHoldMinutes = totalTrades
    ? trades.reduce((s, t) => s + t.holdMinutes, 0) / totalTrades
    : 0;

  // Equity curve to compute max drawdown
  let equity = 100;
  let peak = 100;
  let maxDd = 0;
  for (const t of trades) {
    equity *= 1 + t.pnlPct / 100;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDd) maxDd = dd;
  }

  return {
    trades,
    metrics: {
      totalTrades,
      winRate: Math.round(winRate * 100) / 100,
      totalPnlPct: Math.round(totalPnlPct * 100) / 100,
      avgPnlPct: Math.round(avgPnlPct * 100) / 100,
      maxDrawdownPct: Math.round(maxDd * 100) / 100,
      avgHoldMinutes: Math.round(avgHoldMinutes * 10) / 10,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: ReplayRequest = req.method === 'POST' ? await req.json() : {};
    const symbol = (body.symbol || 'BTCUSDT').toUpperCase().trim();
    let lookback = body.lookbackMinutes ?? 1440;
    if (!Number.isFinite(lookback) || lookback < 60) lookback = 60;
    if (lookback > 10080) lookback = 10080;

    if (!/^[A-Z0-9]{4,20}$/.test(symbol)) {
      return new Response(
        JSON.stringify({ error: 'Invalid symbol. Use Binance format e.g. BTCUSDT.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const bars = await fetchKlines(symbol, lookback);
    if (bars.length < ENTRY_LOOKBACK_BARS + 5) {
      return new Response(
        JSON.stringify({ error: 'Not enough klines returned for replay.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { trades, metrics } = simulate(bars);
    const sampleTrades = trades.slice(-10);

    return new Response(
      JSON.stringify({
        symbol,
        lookbackMinutes: lookback,
        barsAnalyzed: bars.length,
        firstBar: new Date(bars[0].openTime).toISOString(),
        lastBar: new Date(bars[bars.length - 1].openTime).toISOString(),
        metrics,
        sampleTrades,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

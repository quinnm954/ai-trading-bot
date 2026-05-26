/**
 * Backtest Runner — Replays historical CoinGecko candles against a strategy
 * using the shared signal scoring logic. Persists results to backtest_runs.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number; }

// ---------- indicators (Deno port of src/lib/signalScoring.ts) ----------
function ema(values: number[], period: number): number[] {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let g = 0, l = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  if (l === 0) return 100;
  return 100 - 100 / (1 + g / l);
}

// ---------- strategy entry rules ----------
type Strategy = 'ema_crossover' | 'rsi_reversal' | 'vwap_bounce' | 'breakout_volume' | 'pullback_continuation' | 'trend_scalp';

function strategySignal(strategy: Strategy, win: Candle[]): { side: 'buy' | 'sell'; sl: number; tp: number } | null {
  const closes = win.map(c => c.close);
  const last = closes[closes.length - 1];
  const e9 = ema(closes, 9);
  const e21 = ema(closes, 21);
  const r = rsi(closes);
  const last9 = e9[e9.length - 1], prev9 = e9[e9.length - 2] ?? last9;
  const last21 = e21[e21.length - 1], prev21 = e21[e21.length - 2] ?? last21;
  const recent20 = win.slice(-20);
  const hi20 = Math.max(...recent20.map(c => c.high));
  const lo20 = Math.min(...recent20.map(c => c.low));
  const avgVol = recent20.reduce((a, c) => a + c.volume, 0) / 20;
  const lastVol = win[win.length - 1].volume;

  switch (strategy) {
    case 'ema_crossover':
      if (prev9 <= prev21 && last9 > last21) return { side: 'buy', sl: last * 0.99, tp: last * 1.02 };
      if (prev9 >= prev21 && last9 < last21) return { side: 'sell', sl: last * 1.01, tp: last * 0.98 };
      return null;
    case 'rsi_reversal':
      if (r < 30) return { side: 'buy', sl: last * 0.99, tp: last * 1.018 };
      if (r > 70) return { side: 'sell', sl: last * 1.01, tp: last * 0.982 };
      return null;
    case 'vwap_bounce': {
      const tp = recent20.reduce((a, c) => a + ((c.high + c.low + c.close) / 3) * c.volume, 0);
      const vol = recent20.reduce((a, c) => a + c.volume, 0);
      const vw = vol > 0 ? tp / vol : last;
      if (last > vw && last9 > last21) return { side: 'buy', sl: vw, tp: last * 1.015 };
      if (last < vw && last9 < last21) return { side: 'sell', sl: vw, tp: last * 0.985 };
      return null;
    }
    case 'breakout_volume':
      if (last > hi20 * 0.999 && lastVol > avgVol * 1.5) return { side: 'buy', sl: last * 0.985, tp: last * 1.025 };
      if (last < lo20 * 1.001 && lastVol > avgVol * 1.5) return { side: 'sell', sl: last * 1.015, tp: last * 0.975 };
      return null;
    case 'pullback_continuation':
      if (last9 > last21 && last < last9 * 1.002 && last > last21) return { side: 'buy', sl: last21, tp: last * 1.015 };
      if (last9 < last21 && last > last9 * 0.998 && last < last21) return { side: 'sell', sl: last21, tp: last * 0.985 };
      return null;
    case 'trend_scalp':
      if (last9 > last21 && r > 50 && r < 70) return { side: 'buy', sl: last * 0.992, tp: last * 1.012 };
      if (last9 < last21 && r < 50 && r > 30) return { side: 'sell', sl: last * 1.008, tp: last * 0.988 };
      return null;
  }
}

// ---------- fetch candles from CoinGecko ----------
async function fetchCandles(coinId: string, days: number): Promise<Candle[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const raw = await res.json() as number[][];
  return raw.map(([t, o, h, l, c]) => ({ time: t, open: o, high: h, low: l, close: c, volume: 1_000_000 }));
}

const SYMBOL_MAP: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'BNB': 'binancecoin',
  'XRP': 'ripple', 'ADA': 'cardano', 'AVAX': 'avalanche-2', 'DOGE': 'dogecoin',
  'MATIC': 'matic-network', 'LINK': 'chainlink',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );

    const { symbol = 'BTC', strategy = 'ema_crossover', days = 30, initialBalance = 10000, feeRate = 0.001 } = await req.json();
    const coinId = SYMBOL_MAP[symbol.toUpperCase()];
    if (!coinId) throw new Error(`Unsupported symbol: ${symbol}`);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const candles = await fetchCandles(coinId, days);
    if (candles.length < 60) throw new Error('Not enough data');

    // ---------- replay ----------
    let balance = initialBalance;
    let position: { side: 'buy' | 'sell'; entry: number; sl: number; tp: number; qty: number } | null = null;
    const trades: { pnl: number }[] = [];
    let peak = balance;
    let maxDD = 0;

    for (let i = 50; i < candles.length; i++) {
      const win = candles.slice(0, i + 1).slice(-50);
      const cur = candles[i];

      if (position) {
        const hitSL = position.side === 'buy' ? cur.low <= position.sl : cur.high >= position.sl;
        const hitTP = position.side === 'buy' ? cur.high >= position.tp : cur.low <= position.tp;
        if (hitSL || hitTP) {
          const exit = hitTP ? position.tp : position.sl;
          const grossPnl = position.side === 'buy'
            ? (exit - position.entry) * position.qty
            : (position.entry - exit) * position.qty;
          const fees = (position.entry + exit) * position.qty * feeRate;
          const pnl = grossPnl - fees;
          balance += pnl;
          trades.push({ pnl });
          peak = Math.max(peak, balance);
          maxDD = Math.max(maxDD, (peak - balance) / peak);
          position = null;
        }
      }

      if (!position) {
        const sig = strategySignal(strategy as Strategy, win);
        if (sig) {
          const riskPct = 0.01; // 1% per trade
          const riskAmount = balance * riskPct;
          const dist = Math.abs(cur.close - sig.sl);
          if (dist > 0) {
            const qty = riskAmount / dist;
            const margin = qty * cur.close;
            if (margin > 0 && margin < balance * 0.95) {
              position = { side: sig.side, entry: cur.close, sl: sig.sl, tp: sig.tp, qty };
            }
          }
        }
      }
    }

    // ---------- stats ----------
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const totalReturn = ((balance - initialBalance) / initialBalance) * 100;
    const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
    const grossWin = wins.reduce((a, b) => a + b.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((a, b) => a + b.pnl, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;
    const best = trades.reduce((m, t) => Math.max(m, t.pnl), 0);
    const worst = trades.reduce((m, t) => Math.min(m, t.pnl), 0);
    const avgWin = wins.length ? grossWin / wins.length : 0;
    const avgLoss = losses.length ? grossLoss / losses.length : 0;

    const { data: run, error } = await supabase.from('backtest_runs').insert({
      user_id: user.id,
      symbol: symbol.toUpperCase(),
      strategy,
      timeframe: '4h',
      period_days: days,
      initial_balance: initialBalance,
      ending_balance: balance,
      total_return: totalReturn,
      win_rate: winRate,
      max_drawdown: maxDD * 100,
      profit_factor: profitFactor,
      trades_count: trades.length,
      best_trade: best,
      worst_trade: worst,
      avg_win: avgWin,
      avg_loss: avgLoss,
    }).select().single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, run }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── ALPACA CLIENT (US equities) ───────────────────────────────────────────────
// Trading:      https://api.alpaca.markets/v2        (paper: paper-api.alpaca.markets/v2)
// Market data:  https://data.alpaca.markets/v2/stocks/...
// Auth:         APCA-API-KEY-ID / APCA-API-SECRET-KEY headers
//
// Rebuilt rather than restored: retries with backoff on 429/5xx, bounded
// concurrency for multi-symbol reads, asset-aware quantity handling (whole
// shares unless the asset is fractionable), and no silent fabrication of data —
// a failed read returns null so callers can stand down for the cycle.

const DATA_BASE = 'https://data.alpaca.markets';
const UA = 'TitanAI-Alpaca/1.0';

export interface AlpacaCreds {
  keyId: string;
  secretKey: string;
  paper: boolean;
}

export interface AlpacaAccount {
  equity: number;
  cash: number;
  buyingPower: number;
  /** Buying power available for same-day (intraday) exposure. */
  daytradingBuyingPower: number;
  portfolioValue: number;
  /** 'cash' accounts never use margin; 'margin' accounts do. */
  accountType: 'cash' | 'margin';
  multiplier: number;
  tradingBlocked: boolean;
  accountBlocked: boolean;
  /** Informational only — the PDT designation was eliminated on 2026-06-04. */
  daytradeCount: number;
  patternDayTraderFlag: boolean;
  status: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlpc: number;
  side: 'long' | 'short';
}

export interface AlpacaBar {
  t: string;  // RFC-3339 timestamp
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface AlpacaAsset {
  symbol: string;
  name: string;
  tradable: boolean;
  fractionable: boolean;
  marginable: boolean;
  shortable: boolean;
  exchange: string;
  assetClass: string;
}

function tradingBase(creds: AlpacaCreds): string {
  return creds.paper ? 'https://paper-api.alpaca.markets/v2' : 'https://api.alpaca.markets/v2';
}

function headers(creds: AlpacaCreds): Record<string, string> {
  return {
    'APCA-API-KEY-ID': creds.keyId,
    'APCA-API-SECRET-KEY': creds.secretKey,
    'User-Agent': UA,
    'Accept': 'application/json',
  };
}

/** Fetch with backoff on rate limits and transient upstream failures. */
async function request(
  url: string,
  creds: AlpacaCreds,
  init: RequestInit = {},
  attempts = 4,
  // deno-lint-ignore no-explicit-any
): Promise<any | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { ...headers(creds), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers as Record<string, string> || {}) },
      });

      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 500 * Math.pow(2, attempt);
        await sleep(Math.min(waitMs, 8000));
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`Alpaca ${res.status} ${url}: ${body.slice(0, 400)}`);
        return null;
      }

      return await res.json();
    } catch (e) {
      console.error(`Alpaca request failed (${attempt + 1}/${attempts}):`, (e as Error).message);
      await sleep(400 * Math.pow(2, attempt));
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── ACCOUNT ──────────────────────────────────────────────────────────────────

export async function getAccount(creds: AlpacaCreds): Promise<AlpacaAccount | null> {
  const a = await request(`${tradingBase(creds)}/account`, creds);
  if (!a) return null;
  const multiplier = Number(a.multiplier ?? 1);
  return {
    equity: Number(a.equity ?? 0),
    cash: Number(a.cash ?? 0),
    buyingPower: Number(a.buying_power ?? 0),
    daytradingBuyingPower: Number(a.daytrading_buying_power ?? a.buying_power ?? 0),
    portfolioValue: Number(a.portfolio_value ?? a.equity ?? 0),
    accountType: multiplier > 1 ? 'margin' : 'cash',
    multiplier,
    tradingBlocked: !!a.trading_blocked,
    accountBlocked: !!a.account_blocked,
    daytradeCount: Number(a.daytrade_count ?? 0),
    patternDayTraderFlag: !!a.pattern_day_trader,
    status: String(a.status ?? 'UNKNOWN'),
  };
}

export async function getPositions(creds: AlpacaCreds): Promise<AlpacaPosition[]> {
  const rows = await request(`${tradingBase(creds)}/positions`, creds);
  if (!Array.isArray(rows)) return [];
  // deno-lint-ignore no-explicit-any
  return rows.map((p: any) => ({
    symbol: String(p.symbol).toUpperCase(),
    qty: Number(p.qty ?? 0),
    avgEntryPrice: Number(p.avg_entry_price ?? 0),
    currentPrice: Number(p.current_price ?? 0),
    marketValue: Number(p.market_value ?? 0),
    unrealizedPl: Number(p.unrealized_pl ?? 0),
    unrealizedPlpc: Number(p.unrealized_plpc ?? 0) * 100,
    side: p.side === 'short' ? 'short' : 'long',
  }));
}

// ── ASSETS ───────────────────────────────────────────────────────────────────

export async function getAsset(creds: AlpacaCreds, symbol: string): Promise<AlpacaAsset | null> {
  const a = await request(`${tradingBase(creds)}/assets/${encodeURIComponent(symbol)}`, creds);
  if (!a) return null;
  return mapAsset(a);
}

/** Tradable, active US equities/ETFs. Used to build the stock universe. */
export async function listTradableAssets(creds: AlpacaCreds): Promise<AlpacaAsset[]> {
  const rows = await request(
    `${tradingBase(creds)}/assets?status=active&asset_class=us_equity`,
    creds,
  );
  if (!Array.isArray(rows)) return [];
  return rows.map(mapAsset).filter((a) => a.tradable);
}

// deno-lint-ignore no-explicit-any
function mapAsset(a: any): AlpacaAsset {
  return {
    symbol: String(a.symbol).toUpperCase(),
    name: String(a.name ?? ''),
    tradable: !!a.tradable,
    fractionable: !!a.fractionable,
    marginable: !!a.marginable,
    shortable: !!a.shortable,
    exchange: String(a.exchange ?? ''),
    assetClass: String(a.class ?? 'us_equity'),
  };
}

// ── ORDERS ───────────────────────────────────────────────────────────────────

export interface PlaceOrderOpts {
  symbol: string;
  side: 'buy' | 'sell';
  /** Share quantity. Rounded to whole shares unless `fractionable`. */
  qty: number;
  fractionable?: boolean;
  /** Limit price; omit for a market order. */
  limitPrice?: number;
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  extendedHours?: boolean;
  clientOrderId?: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  filledQty: number;
  filledAvgPrice: number | null;
  status: string;
  submittedAt: string;
}

/** Round a share quantity to what the asset actually accepts. */
export function roundQty(qty: number, fractionable: boolean): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  if (!fractionable) return Math.floor(qty);
  // Alpaca accepts up to 9 decimal places on fractionable assets.
  return Math.floor(qty * 1e6) / 1e6;
}

export async function placeOrder(
  creds: AlpacaCreds,
  opts: PlaceOrderOpts,
): Promise<AlpacaOrder | null> {
  const qty = roundQty(opts.qty, opts.fractionable !== false);
  if (qty <= 0) {
    console.error(`Alpaca order rejected locally: quantity rounds to zero for ${opts.symbol}`);
    return null;
  }

  // Fractional and extended-hours orders must be limit/day orders on Alpaca.
  const isFractional = qty % 1 !== 0;
  const body: Record<string, unknown> = {
    symbol: opts.symbol.toUpperCase(),
    side: opts.side,
    qty: String(qty),
    type: opts.limitPrice && opts.limitPrice > 0 ? 'limit' : 'market',
    time_in_force: isFractional || opts.extendedHours ? 'day' : (opts.timeInForce ?? 'day'),
  };
  if (opts.limitPrice && opts.limitPrice > 0) body.limit_price = String(round2(opts.limitPrice));
  if (opts.extendedHours) {
    body.extended_hours = true;
    body.type = 'limit';
    if (!body.limit_price) return null; // extended hours requires a limit price
  }
  if (opts.clientOrderId) body.client_order_id = opts.clientOrderId;

  const o = await request(`${tradingBase(creds)}/orders`, creds, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!o) return null;
  return mapOrder(o);
}

export async function getOrder(creds: AlpacaCreds, orderId: string): Promise<AlpacaOrder | null> {
  const o = await request(`${tradingBase(creds)}/orders/${encodeURIComponent(orderId)}`, creds);
  return o ? mapOrder(o) : null;
}

export async function cancelOrder(creds: AlpacaCreds, orderId: string): Promise<boolean> {
  const res = await request(
    `${tradingBase(creds)}/orders/${encodeURIComponent(orderId)}`,
    creds,
    { method: 'DELETE' },
  );
  return res !== null;
}

/** Poll a submitted order briefly for its fill price. */
export async function waitForFill(
  creds: AlpacaCreds,
  orderId: string,
  timeoutMs = 8000,
): Promise<AlpacaOrder | null> {
  const deadline = Date.now() + timeoutMs;
  let last: AlpacaOrder | null = null;
  while (Date.now() < deadline) {
    last = await getOrder(creds, orderId);
    if (!last) return null;
    if (['filled', 'canceled', 'rejected', 'expired'].includes(last.status)) return last;
    await sleep(700);
  }
  return last;
}

// deno-lint-ignore no-explicit-any
function mapOrder(o: any): AlpacaOrder {
  return {
    id: String(o.id),
    symbol: String(o.symbol).toUpperCase(),
    side: o.side === 'sell' ? 'sell' : 'buy',
    qty: Number(o.qty ?? 0),
    filledQty: Number(o.filled_qty ?? 0),
    filledAvgPrice: o.filled_avg_price != null ? Number(o.filled_avg_price) : null,
    status: String(o.status ?? 'unknown'),
    submittedAt: String(o.submitted_at ?? new Date().toISOString()),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── MARKET DATA ──────────────────────────────────────────────────────────────

export interface StockSnapshot {
  symbol: string;
  price: number;
  change1h: number;
  change24h: number;
  volume: number;
  high24h: number;
  low24h: number;
  /** Latest quoted bid/ask and the resulting spread as % of mid (NaN if unquoted). */
  bid?: number;
  ask?: number;
  spreadPct?: number;
}


/** Latest trade price for many symbols in one request. */
export async function getLatestTrades(
  creds: AlpacaCreds,
  symbols: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const chunk of chunks(symbols, 100)) {
    const data = await request(
      `${DATA_BASE}/v2/stocks/trades/latest?symbols=${chunk.map(encodeURIComponent).join(',')}`,
      creds,
    );
    const trades = data?.trades ?? {};
    for (const [sym, t] of Object.entries(trades)) {
      const p = Number((t as { p?: number })?.p ?? 0);
      if (p > 0) out[sym.toUpperCase()] = p;
    }
  }
  return out;
}

/** Snapshots (latest trade + daily/previous-daily bar + minute bar) for many symbols. */
export async function getSnapshots(
  creds: AlpacaCreds,
  symbols: string[],
): Promise<StockSnapshot[]> {
  const out: StockSnapshot[] = [];
  for (const chunk of chunks(symbols, 100)) {
    const data = await request(
      `${DATA_BASE}/v2/stocks/snapshots?symbols=${chunk.map(encodeURIComponent).join(',')}`,
      creds,
    );
    if (!data) continue;
    const rows = data.snapshots ?? data;
    for (const [sym, s] of Object.entries(rows)) {
      // deno-lint-ignore no-explicit-any
      const snap = s as any;
      const price = Number(snap?.latestTrade?.p ?? snap?.minuteBar?.c ?? snap?.dailyBar?.c ?? 0);
      const prevClose = Number(snap?.prevDailyBar?.c ?? 0);
      const dayOpen = Number(snap?.dailyBar?.o ?? 0);
      if (price <= 0) continue;
      const bid = Number(snap?.latestQuote?.bp ?? 0);
      const ask = Number(snap?.latestQuote?.ap ?? 0);
      const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : 0;
      const spreadPct = mid > 0 && ask >= bid ? ((ask - bid) / mid) * 100 : Number.NaN;
      out.push({
        symbol: sym.toUpperCase(),
        price,
        // Alpaca snapshots give no 1h leg; the caller enriches from hourly bars.
        change1h: Number.NaN,
        change24h: prevClose > 0 ? ((price - prevClose) / prevClose) * 100
          : dayOpen > 0 ? ((price - dayOpen) / dayOpen) * 100 : 0,
        volume: Number(snap?.dailyBar?.v ?? 0) * price,
        high24h: Number(snap?.dailyBar?.h ?? price),
        low24h: Number(snap?.dailyBar?.l ?? price),
        bid: bid > 0 ? bid : undefined,
        ask: ask > 0 ? ask : undefined,
        spreadPct,
      });

    }
  }
  return out;
}

export type BarTimeframe = '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';

/** Historical bars for one symbol, oldest first, paging through Alpaca's cursor. */
export async function getBars(
  creds: AlpacaCreds,
  symbol: string,
  timeframe: BarTimeframe,
  startISO: string,
  endISO?: string,
  limitPerPage = 10000,
): Promise<AlpacaBar[]> {
  const bars: AlpacaBar[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      symbols: symbol.toUpperCase(),
      timeframe,
      start: startISO,
      limit: String(limitPerPage),
      adjustment: 'split',
      feed: 'iex', // free-tier feed; SIP requires a paid data plan
      sort: 'asc',
    });
    if (endISO) params.set('end', endISO);
    if (pageToken) params.set('page_token', pageToken);

    const data = await request(`${DATA_BASE}/v2/stocks/bars?${params.toString()}`, creds);
    if (!data) break;
    const rows = data?.bars?.[symbol.toUpperCase()] ?? [];
    // deno-lint-ignore no-explicit-any
    for (const b of rows as any[]) {
      bars.push({
        t: String(b.t),
        o: Number(b.o),
        h: Number(b.h),
        l: Number(b.l),
        c: Number(b.c),
        v: Number(b.v ?? 0),
      });
    }
    pageToken = data?.next_page_token || undefined;
  } while (pageToken);

  return bars.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
}

/** Bars for several symbols with bounded concurrency. */
export async function getBarsMany(
  creds: AlpacaCreds,
  symbols: string[],
  timeframe: BarTimeframe,
  startISO: string,
  endISO?: string,
  concurrency = 5,
): Promise<Record<string, AlpacaBar[]>> {
  const out: Record<string, AlpacaBar[]> = {};
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, symbols.length) }, async () => {
    while (cursor < symbols.length) {
      const symbol = symbols[cursor++];
      const bars = await getBars(creds, symbol, timeframe, startISO, endISO);
      if (bars.length > 0) out[symbol.toUpperCase()] = bars;
    }
  });
  await Promise.all(workers);
  return out;
}

function chunks<T>(xs: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

// ── CALENDAR / CLOCK ─────────────────────────────────────────────────────────

export interface MarketClock {
  isOpen: boolean;
  nextOpen: string | null;
  nextClose: string | null;
  timestamp: string;
}

export async function getClock(creds: AlpacaCreds): Promise<MarketClock | null> {
  const c = await request(`${tradingBase(creds)}/clock`, creds);
  if (!c) return null;
  return {
    isOpen: !!c.is_open,
    nextOpen: c.next_open ? String(c.next_open) : null,
    nextClose: c.next_close ? String(c.next_close) : null,
    timestamp: String(c.timestamp ?? new Date().toISOString()),
  };
}

export interface CalendarDay {
  date: string;
  open: string;  // "09:30"
  close: string; // "16:00" or "13:00" on early-close days
}

/** Real trading calendar (holidays and early closes come straight from Alpaca). */
export async function getCalendar(
  creds: AlpacaCreds,
  startISO: string,
  endISO: string,
): Promise<CalendarDay[]> {
  const rows = await request(
    `${tradingBase(creds)}/calendar?start=${startISO.slice(0, 10)}&end=${endISO.slice(0, 10)}`,
    creds,
  );
  if (!Array.isArray(rows)) return [];
  // deno-lint-ignore no-explicit-any
  return rows.map((d: any) => ({
    date: String(d.date),
    open: String(d.open ?? '09:30'),
    close: String(d.close ?? '16:00'),
  }));
}

export async function testConnection(
  creds: AlpacaCreds,
): Promise<{ ok: boolean; message: string; account?: AlpacaAccount }> {
  const account = await getAccount(creds);
  if (!account) {
    return { ok: false, message: 'Alpaca rejected these keys, or the account is unreachable.' };
  }
  if (account.accountBlocked || account.tradingBlocked) {
    return { ok: false, message: `Alpaca account is blocked from trading (status ${account.status}).`, account };
  }
  return {
    ok: true,
    message: `Connected to Alpaca ${creds.paper ? 'paper' : 'live'} account — equity $${account.equity.toFixed(2)}.`,
    account,
  };
}

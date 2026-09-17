// ── EARNINGS CALENDAR (US equities) ──────────────────────────────────────────
// Earnings are a risk category crypto simply does not have: a single scheduled
// event can gap a stock 10%+ overnight, straight through any stop. Swing holds
// that straddle a report are therefore not a trade the engine should take.
//
// Source: Nasdaq's public earnings calendar (no key). If it is unreachable the
// map comes back empty and callers treat "unknown" as "cannot confirm it is
// clear" — the playbook flags rather than silently assumes safety.

interface EarningsRow {
  symbol?: string;
  time?: string;
}

export interface EarningsInfo {
  /** Calendar days until the report (0 = today). */
  daysUntil: number;
  /** 'bmo' before open, 'amc' after close, 'unknown' when Nasdaq doesn't say. */
  timing: 'bmo' | 'amc' | 'unknown';
  date: string;
}

export interface EarningsCalendar {
  /** Upper-case symbol → nearest upcoming report inside the lookahead window. */
  bySymbol: Record<string, EarningsInfo>;
  /** False when no day of the window could be fetched — treat dates as unknown. */
  available: boolean;
  daysScanned: number;
}

const CACHE_TTL_MS = 6 * 3600 * 1000;
let cache: { at: number; lookahead: number; value: EarningsCalendar } | null = null;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function classifyTiming(time?: string): EarningsInfo['timing'] {
  const t = (time ?? '').toLowerCase();
  if (t.includes('before')) return 'bmo';
  if (t.includes('after')) return 'amc';
  return 'unknown';
}

async function fetchDay(date: string): Promise<EarningsRow[] | null> {
  try {
    const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      headers: {
        // Nasdaq's endpoint refuses requests without a browser-ish UA.
        'User-Agent': 'Mozilla/5.0 (compatible; TitanAI/1.0)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const rows = json?.data?.rows;
    return Array.isArray(rows) ? rows as EarningsRow[] : [];
  } catch (_e) {
    return null;
  }
}

/**
 * Upcoming earnings dates for the next `lookaheadDays` calendar days.
 * Cached for 6h — the schedule barely moves intraday.
 */
export async function fetchEarningsCalendar(lookaheadDays = 10): Promise<EarningsCalendar> {
  if (cache && cache.lookahead === lookaheadDays && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  const bySymbol: Record<string, EarningsInfo> = {};
  let daysScanned = 0;
  const today = new Date();

  for (let offset = 0; offset <= lookaheadDays; offset++) {
    const day = new Date(today.getTime() + offset * 86400_000);
    const weekday = day.getUTCDay();
    if (weekday === 0 || weekday === 6) continue; // no reports on weekends
    const date = isoDay(day);
    const rows = await fetchDay(date);
    if (rows === null) continue;
    daysScanned++;
    for (const row of rows) {
      const symbol = String(row.symbol ?? '').trim().toUpperCase();
      if (!symbol) continue;
      if (bySymbol[symbol]) continue; // keep the nearest date only
      bySymbol[symbol] = { daysUntil: offset, timing: classifyTiming(row.time), date };
    }
  }

  const value: EarningsCalendar = { bySymbol, available: daysScanned > 0, daysScanned };
  cache = { at: Date.now(), lookahead: lookaheadDays, value };
  return value;
}

/** Nearest report for one symbol, or null when nothing is scheduled in the window. */
export function earningsFor(calendar: EarningsCalendar, symbol: string): EarningsInfo | null {
  return calendar.bySymbol[symbol.toUpperCase()] ?? null;
}

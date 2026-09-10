// ── Real on-chain trader data (Hyperliquid public API, no key required) ───────
//
// Copy trading used to invent traders and their trades with Math.random(). This
// module replaces that with actual wallets and actual fills:
//
//   • https://stats-data.hyperliquid.xyz/Mainnet/leaderboard  — every mainnet
//     account with real PnL / ROI / volume windows. The full payload is ~37 MB of
//     pretty-printed JSON; parsing all 45k rows blows the function's compute budget,
//     so only the first few MB are pulled with a Range request and scanned with
//     field regexes. That slice still yields hundreds of qualifying real traders.
//   • POST https://api.hyperliquid.xyz/info {"type":"userFillsByTime", ...} —
//     the wallet's real executed fills, which become copy-trade signals.

const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const INFO_URL = 'https://api.hyperliquid.xyz/info';
const LEADERBOARD_SLICE_BYTES = 6_000_000;
const ROW_MARKER = '"ethAddress"';

export interface TraderCandidate {
  wallet: string;
  displayName: string | null;
  accountValue: number;
  dayPnl: number;
  weekPnl: number;
  monthPnl: number;
  monthRoi: number;
  allTimePnl: number;
  allTimeRoi: number;
  monthVolume: number;
  score: number;
}

export interface Fill {
  coin: string;
  px: number;
  sz: number;
  side: string;
  time: number;
  dir: string;
  closedPnl: number;
}

export interface TraderStats {
  winRate: number | null;
  closedTrades: number;
  avgTradeSizeUsd: number;
  bestAssets: string[];
  lastActiveAt: string | null;
  tradingStyle: string;
  riskScore: number;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const WALLET_RE = /:\s*"(0x[0-9a-fA-F]{40})"/;
const ACCOUNT_VALUE_RE = /"accountValue":\s*"(-?[\d.eE+]+)"/;
const DISPLAY_NAME_RE = /"displayName":\s*(?:null|"([^"]*)")/;

function windowPerf(segment: string, name: string) {
  const re = new RegExp(
    `"${name}",\\s*\\{\\s*"pnl":\\s*"(-?[\\d.eE+]+)",\\s*"roi":\\s*"(-?[\\d.eE+]+)",\\s*"vlm":\\s*"(-?[\\d.eE+]+)"`,
  );
  const m = segment.match(re);
  if (!m) return null;
  return { pnl: num(m[1]), roi: num(m[2]), vlm: num(m[3]) };
}

/**
 * Traders worth copying: real capital at risk, positive month and lifetime, and
 * actively trading. Ranked by month ROI with a lifetime-consistency bonus.
 */
function toCandidate(segment: string): TraderCandidate | null {
  const walletMatch = segment.match(WALLET_RE);
  const avMatch = segment.match(ACCOUNT_VALUE_RE);
  if (!walletMatch || !avMatch) return null;

  const day = windowPerf(segment, 'day');
  const week = windowPerf(segment, 'week');
  const month = windowPerf(segment, 'month');
  const allTime = windowPerf(segment, 'allTime');
  if (!month || !allTime) return null;

  const accountValue = num(avMatch[1]);
  if (accountValue < 100_000) return null;              // real skin in the game
  if (month.pnl <= 0 || month.roi <= 0.03) return null; // profitable this month
  if (allTime.pnl <= 0) return null;                    // profitable lifetime
  if (month.vlm <= 0) return null;                      // actually trading
  if ((day?.vlm ?? 0) <= 0) return null;                // traded in the last 24h

  const score = month.roi * 100 + Math.min(50, allTime.roi * 50) + ((week?.pnl ?? 0) > 0 ? 5 : 0);

  return {
    wallet: walletMatch[1].toLowerCase(),
    displayName: segment.match(DISPLAY_NAME_RE)?.[1] ?? null,
    accountValue,
    dayPnl: day?.pnl ?? 0,
    weekPnl: week?.pnl ?? 0,
    monthPnl: month.pnl,
    monthRoi: month.roi,
    allTimePnl: allTime.pnl,
    allTimeRoi: allTime.roi,
    monthVolume: month.vlm,
    score,
  };
}

/** Pull a slice of the leaderboard and return the best `limit` real traders in it. */
export async function fetchTopTraderCandidates(limit = 20): Promise<TraderCandidate[]> {
  const res = await fetch(LEADERBOARD_URL, {
    headers: { Range: `bytes=0-${LEADERBOARD_SLICE_BYTES}` },
  });
  if (!res.ok && res.status !== 206) throw new Error(`Leaderboard fetch failed: ${res.status}`);

  const text = await res.text();
  const segments = text.split(ROW_MARKER).slice(1);

  const keep: TraderCandidate[] = [];
  for (const segment of segments) {
    const cand = toCandidate(segment);
    if (cand) keep.push(cand);
  }

  keep.sort((a, b) => b.score - a.score);
  console.log(`[HYPERLIQUID] scanned ${segments.length} leaderboard rows, ${keep.length} qualified`);
  return keep.slice(0, limit);
}

function mapFills(raw: unknown): Fill[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((f: any) => ({
    coin: String(f?.coin ?? '').toUpperCase(),
    px: num(f?.px),
    sz: num(f?.sz),
    side: String(f?.side ?? ''),
    time: num(f?.time),
    dir: String(f?.dir ?? ''),
    closedPnl: num(f?.closedPnl),
  })).filter((f) => f.coin && f.px > 0 && f.sz > 0);
}

/** Real executed fills for a wallet since `startTime` (ms epoch). */
export async function fetchFills(wallet: string, startTime: number): Promise<Fill[]> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFillsByTime', user: wallet, startTime }),
  });
  if (!res.ok) throw new Error(`userFillsByTime ${wallet} failed: ${res.status}`);
  return mapFills(await res.json());
}

/**
 * The wallet's most recent real fills (API caps at 2000). `userFillsByTime` fills
 * that cap from the *oldest* end, so busy traders' latest activity is invisible
 * through it — profiling and activity checks must use this instead.
 */
export async function fetchRecentFills(wallet: string): Promise<Fill[]> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFills', user: wallet }),
  });
  if (!res.ok) throw new Error(`userFills ${wallet} failed: ${res.status}`);
  return mapFills(await res.json());
}

/** Win rate, style and sizing derived from the wallet's own closing fills. */
export function statsFromFills(fills: Fill[]): TraderStats {
  const closes = fills.filter((f) => /Close|Liquidat/i.test(f.dir) && f.closedPnl !== 0);
  const wins = closes.filter((f) => f.closedPnl > 0).length;

  const notionals = fills.map((f) => f.px * f.sz).filter((v) => v > 0);
  const avgTradeSizeUsd = notionals.length
    ? notionals.reduce((s, v) => s + v, 0) / notionals.length
    : 0;

  const pnlByCoin = new Map<string, number>();
  for (const f of closes) pnlByCoin.set(f.coin, (pnlByCoin.get(f.coin) ?? 0) + f.closedPnl);
  const bestAssets = [...pnlByCoin.entries()]
    .filter(([, pnl]) => pnl > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([coin]) => coin);

  const times = fills.map((f) => f.time).filter((t) => t > 0).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  const medianGapMin = gaps.length ? gaps[Math.floor(gaps.length / 2)] / 60_000 : Infinity;

  const tradingStyle =
    medianGapMin < 5 ? 'scalper' :
    medianGapMin < 60 ? 'momentum' :
    medianGapMin < 1440 ? 'swing' : 'holder';

  const maxNotional = notionals.length ? Math.max(...notionals) : 0;
  const riskScore = avgTradeSizeUsd > 0
    ? Math.min(100, Math.round((maxNotional / Math.max(avgTradeSizeUsd, 1)) * 8))
    : 50;

  return {
    winRate: closes.length >= 5 ? (wins / closes.length) * 100 : null,
    closedTrades: closes.length,
    avgTradeSizeUsd,
    bestAssets,
    lastActiveAt: times.length ? new Date(times[times.length - 1]).toISOString() : null,
    tradingStyle,
    riskScore,
  };
}

/**
 * A fill only becomes a copyable signal when it is a long open or a long close —
 * this app trades spot long-only, so shorts are ignored rather than inverted.
 */
export function fillToAction(dir: string): 'buy' | 'sell' | null {
  if (/Open Long/i.test(dir)) return 'buy';
  if (/Close Long/i.test(dir)) return 'sell';
  if (/^Buy$/i.test(dir)) return 'buy';
  if (/^Sell$/i.test(dir)) return 'sell';
  return null;
}

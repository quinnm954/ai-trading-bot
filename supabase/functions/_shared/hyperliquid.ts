// ── Real on-chain trader data (Hyperliquid public API, no key required) ───────
//
// Copy trading used to invent traders and their trades with Math.random(). This
// module replaces that with actual wallets and actual fills:
//
//   • https://stats-data.hyperliquid.xyz/Mainnet/leaderboard  — every mainnet
//     account with real PnL / ROI / volume windows. The payload is ~37 MB, so it
//     is parsed as a stream and only the best candidates are ever held in memory.
//   • POST https://api.hyperliquid.xyz/info {"type":"userFillsByTime", ...} —
//     the wallet's real executed fills, which become copy-trade signals.

const LEADERBOARD_URL = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const INFO_URL = 'https://api.hyperliquid.xyz/info';
const ROW_MARKER = '{"ethAddress"';

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

function windowPerf(row: any, name: string) {
  const entry = (row?.windowPerformances ?? []).find((w: any) => w?.[0] === name);
  const p = entry?.[1] ?? {};
  return { pnl: num(p.pnl), roi: num(p.roi), vlm: num(p.vlm) };
}

/**
 * Traders worth copying: real capital at risk, positive month and lifetime, and
 * actively trading. Ranked by month ROI with a lifetime-consistency bonus.
 */
function toCandidate(row: any): TraderCandidate | null {
  const wallet = String(row?.ethAddress ?? '').toLowerCase();
  if (!wallet.startsWith('0x')) return null;

  const accountValue = num(row?.accountValue);
  const day = windowPerf(row, 'day');
  const week = windowPerf(row, 'week');
  const month = windowPerf(row, 'month');
  const allTime = windowPerf(row, 'allTime');

  if (accountValue < 100_000) return null;      // real skin in the game
  if (month.pnl <= 0 || month.roi <= 0.03) return null; // profitable this month
  if (allTime.pnl <= 0) return null;            // profitable lifetime
  if (month.vlm <= 0) return null;              // actually trading

  const score = month.roi * 100 + Math.min(50, allTime.roi * 50) + (week.pnl > 0 ? 5 : 0);

  return {
    wallet,
    displayName: row?.displayName ?? null,
    accountValue,
    dayPnl: day.pnl,
    weekPnl: week.pnl,
    monthPnl: month.pnl,
    monthRoi: month.roi,
    allTimePnl: allTime.pnl,
    allTimeRoi: allTime.roi,
    monthVolume: month.vlm,
    score,
  };
}

/** Stream the leaderboard and keep only the top `limit` candidates. */
export async function fetchTopTraderCandidates(limit = 25): Promise<TraderCandidate[]> {
  const res = await fetch(LEADERBOARD_URL);
  if (!res.ok || !res.body) throw new Error(`Leaderboard fetch failed: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const keep: TraderCandidate[] = [];
  let buf = '';
  let scanned = 0;

  const consume = (segment: string) => {
    const start = segment.indexOf(ROW_MARKER);
    if (start < 0) return;
    let json = segment.slice(start).trim();
    while (json.endsWith(',') || json.endsWith(']') || json.endsWith('}')) {
      // Row objects are self-closing; strip the array/object tail of the payload.
      if (json.endsWith(',')) { json = json.slice(0, -1).trim(); continue; }
      break;
    }
    // Trailing `]}` from the end of the document must go, the row's own `}` stays.
    if (json.endsWith(']}')) json = json.slice(0, -2).trim();
    if (json.endsWith(',')) json = json.slice(0, -1).trim();
    try {
      const row = JSON.parse(json);
      scanned++;
      const cand = toCandidate(row);
      if (cand) {
        keep.push(cand);
        if (keep.length > limit * 4) {
          keep.sort((a, b) => b.score - a.score);
          keep.length = limit * 2;
        }
      }
    } catch {
      // Partial or malformed row — skip it rather than failing the whole scan.
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf(ROW_MARKER, 1)) > 0) {
      consume(buf.slice(0, idx));
      buf = buf.slice(idx);
    }
    // Guard against a pathological buffer if the marker never reappears.
    if (buf.length > 2_000_000) buf = buf.slice(-1_000_000);
  }
  consume(buf);

  keep.sort((a, b) => b.score - a.score);
  console.log(`[HYPERLIQUID] scanned ${scanned} leaderboard rows, kept ${Math.min(keep.length, limit)}`);
  return keep.slice(0, limit);
}

/** Real executed fills for a wallet since `startTime` (ms epoch). */
export async function fetchFills(wallet: string, startTime: number): Promise<Fill[]> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFillsByTime', user: wallet, startTime }),
  });
  if (!res.ok) throw new Error(`userFillsByTime ${wallet} failed: ${res.status}`);
  const raw = await res.json();
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

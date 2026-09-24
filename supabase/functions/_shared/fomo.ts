// ── FOMO.family trader data via FOMO API (independent, unofficial; https://fomoapi.io) ──
// Needs FOMO_API_KEY. Free tier = 250,000 credits/month ≈ 1,000 calls, so callers
// must budget: leaderboard ~daily, followed-trader positions on a throttled cadence.

const BASE = 'https://api.fomoapi.io';

export class FomoApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`FOMO API [${status}]: ${body.slice(0, 300)}`);
  }
}

export function getFomoKey(): string | null {
  return Deno.env.get('FOMO_API_KEY') || null;
}

async function fomoGet(path: string, key: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${key}` } });
  if (!res.ok) throw new FomoApiError(res.status, await res.text());
  return await res.json();
}

export interface FomoTrader {
  rank: number;
  handle: string;
  userId: string;
  displayName: string | null;
  pnlUsd: number;
  volumeUsd: number;
  trades: number;
  followers: number;
}

export async function fetchFomoLeaderboard(key: string, window = '7d', limit = 25): Promise<FomoTrader[]> {
  const d = await fomoGet(`/v2/leaderboard/${window}?limit=${limit}`, key);
  const rows: any[] = Array.isArray(d?.traders) ? d.traders : [];
  return rows
    .filter((r) => r?.handle && r?.userId)
    .map((r) => ({
      rank: Number(r.rank) || 0,
      handle: String(r.handle),
      userId: String(r.userId),
      displayName: r.displayName ?? null,
      pnlUsd: Number(r.pnlUsd) || 0,
      volumeUsd: Number(r.volumeUsd) || 0,
      trades: Number(r.trades) || 0,
      followers: Number(r.followers) || 0,
    }));
}

export interface FomoPosition {
  tradeId: string;
  symbol: string;
  status: 'open' | 'closed' | string;
  boughtAmount: number;
  soldAmount: number;
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  costBasisUsd: number;
  realizedPnlUsd: number;
  createdAt: number | null;
  closedAt: number | null;
}

const ts = (v: unknown) => {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
};

export async function fetchFomoPositions(key: string, handle: string): Promise<FomoPosition[]> {
  const d = await fomoGet(`/v2/users/${encodeURIComponent(handle)}/positions`, key);
  if (d?.available === false) return [];
  const rows: any[] = d?.positions ?? d?.trades ?? d?.items ?? (Array.isArray(d) ? d : []);
  return rows.map((r) => ({
    tradeId: String(r.tradeId ?? r.id ?? ''),
    symbol: String(r.token?.symbol ?? r.symbol ?? '').toUpperCase(),
    status: r.status,
    boughtAmount: Number(r.boughtAmount) || 0,
    soldAmount: Number(r.soldAmount) || 0,
    avgEntryPrice: r.avgEntryPrice == null ? null : Number(r.avgEntryPrice),
    avgExitPrice: r.avgExitPrice == null ? null : Number(r.avgExitPrice),
    costBasisUsd: Number(r.costBasisUsd) || 0,
    realizedPnlUsd: Number(r.realizedPnlUsd) || 0,
    createdAt: ts(r.createdAt),
    closedAt: ts(r.closedAt),
  }));
}

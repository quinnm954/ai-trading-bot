// ═══════════════════════════════════════════════════════════════════════════════
// 🌐 AGGREGATE TAPE GATE — the market-wide stand-down rule
//
// Equal-weighted average 24h and 1h return of the most liquid non-stable assets,
// plus breadth (% of names up on 24h). Long swings only run with the tape.
//
// Thresholds live here (not inline in the engine) so the backtest replay gates on
// EXACTLY the same numbers the engine is running in production. Change them once,
// and both the live path and every future backtest move together.
// ═══════════════════════════════════════════════════════════════════════════════

export const TAPE_MIN_24H_PCT = -0.5;   // allow flat/drifting tape, only stand down in real downtrends
export const TAPE_MIN_1H_PCT = -0.5;    // tolerate normal short-term noise; only block a genuinely falling hour
export const TAPE_MIN_BREADTH = 0.45;   // relaxed from 65% so drifting markets still qualify

/** How many liquid names the tape read is measured across. */
export const TAPE_UNIVERSE_SIZE = 40;
/** Minimum names in the read before it is trusted at all. */
export const TAPE_MIN_SAMPLE = 8;
/** Minimum names with a usable hourly move before the 1h leg is trusted. */
export const TAPE_MIN_HOURLY_SAMPLE = 8;

export interface TapeThresholds {
  min24hPct: number;
  min1hPct: number;
  minBreadth: number;
}

export const TAPE_DEFAULTS: TapeThresholds = {
  min24hPct: TAPE_MIN_24H_PCT,
  min1hPct: TAPE_MIN_1H_PCT,
  minBreadth: TAPE_MIN_BREADTH,
};

export interface TapeRead {
  rising: boolean;
  avg24h: number;
  avg1h: number;
  breadth: number;
  label: string;
}

/**
 * Judge a tape read. `changes24h` and `changes1h` are the per-name moves across the
 * liquid universe; `changes1h` may be shorter when some names have no usable hourly bar.
 */
export function evaluateTape(
  changes24h: number[],
  changes1h: number[],
  thresholds: TapeThresholds = TAPE_DEFAULTS,
): TapeRead {
  if (changes24h.length < TAPE_MIN_SAMPLE) {
    return { rising: false, avg24h: 0, avg1h: 0, breadth: 0, label: 'insufficient market data for tape read' };
  }

  const avg24h = changes24h.reduce((s, v) => s + v, 0) / changes24h.length;
  const hourly = changes1h.filter((v) => Number.isFinite(v));
  const avg1h = hourly.length > 0 ? hourly.reduce((s, v) => s + v, 0) / hourly.length : Number.NaN;
  const breadth = changes24h.filter((v) => v > 0).length / changes24h.length;

  const hasHourlyBreadth = hourly.length >= TAPE_MIN_HOURLY_SAMPLE;
  const rising =
    avg24h >= thresholds.min24hPct &&
    hasHourlyBreadth &&
    avg1h >= thresholds.min1hPct &&
    breadth >= thresholds.minBreadth;

  const label =
    `tape 24h ${avg24h >= 0 ? '+' : ''}${avg24h.toFixed(2)}% (need ≥${thresholds.min24hPct}%), ` +
    `1h ${hasHourlyBreadth ? `${avg1h >= 0 ? '+' : ''}${avg1h.toFixed(2)}%` : 'insufficient data'} (need ≥${thresholds.min1hPct}%, n=${hourly.length}), ` +
    `breadth ${(breadth * 100).toFixed(0)}% (need ≥${thresholds.minBreadth * 100}%) across ${changes24h.length} liquid names`;

  return { rising, avg24h, avg1h, breadth, label };
}

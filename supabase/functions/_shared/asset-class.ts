// ── ASSET CLASS + FEE MODEL ──────────────────────────────────────────────────
// Crypto executes on Coinbase where each leg pays a 0.4% maker fee, so a round
// trip costs 0.8% and every target has to be solved net of it.
//
// Stocks execute on Alpaca, which is commission-free for US equities and ETFs.
// Charging them the crypto round trip would inflate every stock target by 0.8%
// and make ordinary equity moves look unreachable, so stocks carry a small
// spread/slippage allowance instead of a commission.

export type AssetClass = 'crypto' | 'stocks';

/** Round-trip cost assumption, in percent of notional, per asset class. */
export const ROUND_TRIP_COST_PCT: Record<AssetClass, number> = {
  crypto: 0.8,  // 0.4% maker in + 0.4% maker out
  stocks: 0.06, // zero commission; half-spread + slippage allowance on both legs
};

export function roundTripCostPct(assetClass: AssetClass): number {
  return ROUND_TRIP_COST_PCT[assetClass] ?? ROUND_TRIP_COST_PCT.crypto;
}

/** Normalise whatever a settings row / trade row carries into an AssetClass. */
export function assetClassOf(value: unknown): AssetClass {
  const v = String(value ?? '').toLowerCase();
  return v === 'stocks' || v === 'stock' || v === 'equities' ? 'stocks' : 'crypto';
}

/** DB `market_type` enum value for an asset class. */
export function marketTypeOf(assetClass: AssetClass): 'crypto' | 'stocks' {
  return assetClass === 'stocks' ? 'stocks' : 'crypto';
}

/** Which asset class an account is configured to trade this cycle. */
// deno-lint-ignore no-explicit-any
export function accountAssetClass(settings: any): AssetClass {
  if (settings?.market_mode) return assetClassOf(settings.market_mode);
  const allowed: string[] = Array.isArray(settings?.allowed_markets) ? settings.allowed_markets : [];
  if (allowed.length === 1 && assetClassOf(allowed[0]) === 'stocks') return 'stocks';
  return 'crypto';
}

/** True when this asset class trades around the clock. */
export function isAlwaysOpen(assetClass: AssetClass): boolean {
  return assetClass === 'crypto';
}

export function labelOf(assetClass: AssetClass): string {
  return assetClass === 'stocks' ? 'US equities' : 'crypto';
}

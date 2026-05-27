// Shared volatility / regime / leverage helpers used by UI and edge functions.
// Edge functions inline an equivalent copy because they can't import from `src/`.

export type Regime = 'trending' | 'ranging' | 'high_volatility' | 'low_volatility' | 'news_driven';

export interface VolatilityProfile {
  atrPct: number;          // ATR as % of price
  rangePct: number;        // 24h high-low range as % of price
  classification: 'low' | 'normal' | 'high' | 'extreme';
}

export function classifyVolatility(atrPct: number, rangePct: number): VolatilityProfile['classification'] {
  const v = Math.max(atrPct, rangePct / 2);
  if (v < 1.5) return 'low';
  if (v < 4) return 'normal';
  if (v < 8) return 'high';
  return 'extreme';
}

/**
 * Effective leverage = how much of the user's leverage cap is actually safe to use
 * given current regime + volatility. Returns { leverage, reason }.
 */
export function computeEffectiveLeverage(
  userCap: number,
  regime: Regime,
  atrPct: number,
): { leverage: number; reason: string } {
  const cap = Math.max(1, userCap);
  const cls = classifyVolatility(atrPct, atrPct * 2);

  if (regime === 'news_driven') return { leverage: Math.min(cap, 1), reason: 'news regime — leverage suppressed' };
  if (regime === 'high_volatility' || cls === 'extreme') return { leverage: Math.min(cap, 2), reason: 'high volatility — leverage scaled down' };
  if (cls === 'high') return { leverage: Math.min(cap, Math.max(2, Math.floor(cap * 0.5))), reason: 'elevated volatility — leverage halved' };
  if (regime === 'ranging') return { leverage: Math.min(cap, Math.max(2, Math.floor(cap * 0.7))), reason: 'ranging market — moderate leverage' };
  if (regime === 'trending' && cls === 'low') return { leverage: cap, reason: 'clean trend — full leverage' };
  return { leverage: Math.min(cap, Math.max(2, Math.floor(cap * 0.8))), reason: 'standard conditions' };
}

/**
 * Build a dynamic grid centered on `centerPrice` with ATR-tuned spacing.
 * Returns array of price levels (mixed buy/sell zones above + below center).
 */
export function computeDynamicGrid(opts: {
  centerPrice: number;
  atr: number;
  regime: Regime;
  high24h?: number;
  low24h?: number;
}): {
  centerPrice: number;
  spacing: number;
  levels: { price: number; side: 'buy' | 'sell'; distance: number }[];
  upper: number;
  lower: number;
} {
  const { centerPrice, atr, regime, high24h, low24h } = opts;
  const multiplier =
    regime === 'low_volatility' ? 0.5 :
    regime === 'high_volatility' ? 1.5 :
    1.0;
  const spacing = Math.max(atr * multiplier, centerPrice * 0.003); // min 0.3% spacing
  const range = (high24h && low24h) ? (high24h - low24h) : atr * 6;
  const half = Math.max(3, Math.min(6, Math.floor(range / 2 / spacing)));

  const levels: { price: number; side: 'buy' | 'sell'; distance: number }[] = [];
  for (let i = 1; i <= half; i++) {
    levels.push({ price: centerPrice - spacing * i, side: 'buy', distance: spacing * i });
    levels.push({ price: centerPrice + spacing * i, side: 'sell', distance: spacing * i });
  }
  return {
    centerPrice,
    spacing,
    levels,
    upper: centerPrice + spacing * half,
    lower: centerPrice - spacing * half,
  };
}

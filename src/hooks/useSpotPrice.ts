import { useCallback, useEffect, useState } from 'react';

interface Options {
  /** CoinGecko id used when the pair isn't listed on Coinbase Exchange (e.g. usd-coin). */
  coingeckoId?: string;
  refreshMs?: number;
}

/**
 * Live spot price for a Coinbase product (e.g. "BTC-USD"), with a CoinGecko
 * fallback for pairs Coinbase Exchange doesn't list. Real market data only —
 * no simulated or hardcoded values.
 */
export function useSpotPrice(productId: string, { coingeckoId, refreshMs = 30000 }: Options = {}) {
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const valid = (v: unknown) => Number.isFinite(Number(v)) && Number(v) > 0;

    try {
      const res = await fetch(`https://api.exchange.coinbase.com/products/${productId}/ticker`);
      if (res.ok) {
        const data = await res.json();
        if (valid(data?.price)) {
          setPrice(Number(data.price));
          setError(null);
          return;
        }
      }
      if (coingeckoId) {
        const cg = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd`
        );
        if (cg.ok) {
          const data = await cg.json();
          const next = data?.[coingeckoId]?.usd;
          if (valid(next)) {
            setPrice(Number(next));
            setError(null);
            return;
          }
        }
      }
      throw new Error('no price');
    } catch {
      setError(`No live price for ${productId}`);
    }
  }, [productId, coingeckoId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  return { price, error, refetch: load };
}

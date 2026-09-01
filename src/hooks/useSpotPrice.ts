import { useCallback, useEffect, useState } from 'react';

/**
 * Live spot price for a Coinbase product (e.g. "USDC-USD", "BTC-USD").
 * Real exchange data only — no simulated or hardcoded values.
 */
export function useSpotPrice(productId: string, refreshMs = 30000) {
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`https://api.exchange.coinbase.com/products/${productId}/ticker`);
      if (!res.ok) throw new Error(`ticker ${res.status}`);
      const data = await res.json();
      const next = Number(data?.price);
      if (!Number.isFinite(next) || next <= 0) throw new Error('bad price');
      setPrice(next);
      setError(null);
    } catch {
      setError(`No live price for ${productId}`);
    }
  }, [productId]);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  return { price, error, refetch: load };
}

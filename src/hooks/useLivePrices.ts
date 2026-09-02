import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Live spot prices for a set of crypto symbols (Coinbase Exchange tickers with a
 * CoinGecko fallback). Real market rates only — never cached DB prices.
 */
export function useLivePrices(symbols: string[], refreshMs = 15000) {
  const key = useMemo(
    () => [...new Set(symbols.map(s => s.toUpperCase()).filter(Boolean))].sort().join(','),
    [symbols],
  );
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const list = key ? key.split(',') : [];
    if (list.length === 0) {
      setPrices({});
      return;
    }

    const next: Record<string, number> = {};
    await Promise.all(
      list.map(async (symbol) => {
        for (const quote of ['USD', 'USDC']) {
          try {
            const res = await fetch(`https://api.exchange.coinbase.com/products/${symbol}-${quote}/ticker`);
            if (!res.ok) continue;
            const data = await res.json();
            const price = Number(data?.price);
            if (Number.isFinite(price) && price > 0) {
              next[symbol] = price;
              return;
            }
          } catch {
            /* try next quote */
          }
        }
      }),
    );

    setPrices(prev => ({ ...prev, ...next }));
    setUpdatedAt(new Date());
  }, [key]);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  return { prices, updatedAt, refetch: load };
}

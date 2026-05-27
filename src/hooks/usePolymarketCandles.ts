import { useQuery } from '@tanstack/react-query';

export interface Candle {
  t: number; // unix seconds (bucket start)
  open: number;
  high: number;
  low: number;
  close: number;
}

export function usePolymarketCandles(tokenId: string | null, fidelity: 5 | 15, interval = '1w') {
  return useQuery({
    queryKey: ['polymarket-candles', tokenId, fidelity, interval],
    enabled: !!tokenId,
    refetchInterval: fidelity * 60 * 1000,
    staleTime: 30_000,
    queryFn: async () => {
      const base = import.meta.env.VITE_SUPABASE_URL as string;
      const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
      const url = new URL(`${base}/functions/v1/polymarket-candles`);
      url.searchParams.set('token_id', tokenId!);
      url.searchParams.set('fidelity', String(fidelity));
      url.searchParams.set('interval', interval);
      const res = await fetch(url.toString(), {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      if (!res.ok) throw new Error(`candles fetch failed: ${res.status}`);
      const json = await res.json();
      return (json.candles ?? []) as Candle[];
    },
  });
}

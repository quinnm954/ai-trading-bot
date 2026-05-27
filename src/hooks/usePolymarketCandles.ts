import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Candle {
  t: number; // unix seconds (bucket start)
  open: number;
  high: number;
  low: number;
  close: number;
}

export function usePolymarketCandles(tokenId: string | null, fidelity: 5 | 15, interval = '1d') {
  return useQuery({
    queryKey: ['polymarket-candles', tokenId, fidelity, interval],
    enabled: !!tokenId,
    refetchInterval: fidelity * 60 * 1000, // refresh once per candle
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('polymarket-candles', {
        method: 'GET',
        // pass via query string by appending to function name workaround:
      } as any);
      // supabase.functions.invoke doesn't support GET query params well; call via fetch directly
      void data; void error;
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/polymarket-candles`);
      url.searchParams.set('token_id', tokenId!);
      url.searchParams.set('fidelity', String(fidelity));
      url.searchParams.set('interval', interval);
      const res = await fetch(url.toString(), {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
      });
      if (!res.ok) throw new Error(`candles fetch failed: ${res.status}`);
      const json = await res.json();
      return (json.candles ?? []) as Candle[];
    },
  });
}

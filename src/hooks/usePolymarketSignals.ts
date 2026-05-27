import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PolymarketSignal {
  event_id: string;
  event_title: string;
  market_id: string;
  question: string;
  slug: string;
  outcomes: string[];
  prices: number[];
  yes_probability: number | null;
  volume: number;
  liquidity: number;
  end_date: string | null;
  url: string;
}

export function usePolymarketSignals() {
  return useQuery({
    queryKey: ['polymarket-signals'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('polymarket-signals');
      if (error) throw error;
      return (data?.signals ?? []) as PolymarketSignal[];
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}

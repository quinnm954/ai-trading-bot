import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FusionSignal {
  id: string;
  symbol: string;
  conviction: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  horizon: 'short' | 'medium' | 'long';
  drivers: string[];
  rationale: string | null;
  features: Record<string, any>;
  generated_at: string;
}

export function useTitanFusion() {
  return useQuery({
    queryKey: ['titan-fusion-signals'],
    queryFn: async () => {
      // Latest signal per symbol
      const { data, error } = await supabase
        .from('titan_fusion_signals')
        .select('*')
        .order('generated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const seen = new Set<string>();
      const latest = (data ?? []).filter((row: any) => {
        if (seen.has(row.symbol)) return false;
        seen.add(row.symbol);
        return true;
      });
      latest.sort((a: any, b: any) => b.conviction - a.conviction);
      return latest as FusionSignal[];
    },
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });
}

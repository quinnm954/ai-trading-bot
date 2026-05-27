import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiquidationCluster {
  id: string;
  symbol: string;
  price_level: number;
  side: 'long' | 'short';
  cluster_size_usd: number;
  position_count: number;
  source: 'internal' | 'external';
  updated_at: string;
}

export function useLiquidationMap(symbol?: string) {
  const [clusters, setClusters] = useState<LiquidationCluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    let q = supabase.from('liquidation_map' as never).select('*').order('cluster_size_usd', { ascending: false }).limit(50);
    if (symbol) q = q.eq('symbol', symbol);
    const { data } = await q;
    setClusters((data as unknown as LiquidationCluster[]) || []);
    setIsLoading(false);
  }, [symbol]);

  useEffect(() => {
    fetchData();
    const ch = supabase
      .channel(`liq-map-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'liquidation_map' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [fetchData]);

  return { clusters, isLoading, refetch: fetchData };
}

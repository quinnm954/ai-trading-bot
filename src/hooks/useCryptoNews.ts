import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  summary: string | null;
  symbols: string[];
  sentiment: number;
  published_at: string;
}

export function useCryptoNews(symbol?: string) {
  return useQuery({
    queryKey: ['crypto-news', symbol ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('news_feed')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(50);
      if (symbol) q = q.contains('symbols', [symbol]);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as NewsItem[];
    },
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
}

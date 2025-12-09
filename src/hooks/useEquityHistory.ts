import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface EquityPoint {
  id: string;
  equity: number;
  recordedAt: Date;
}

export function useEquityHistory(days: number = 30) {
  const { user } = useAuth();
  const [equityHistory, setEquityHistory] = useState<EquityPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchEquityHistory = useCallback(async () => {
    if (!user) return;

    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('equity_history')
        .select('*')
        .eq('user_id', user.id)
        .gte('recorded_at', startDate.toISOString())
        .order('recorded_at', { ascending: true });

      if (error) throw error;

      const formattedHistory: EquityPoint[] = (data || []).map(point => ({
        id: point.id,
        equity: Number(point.equity),
        recordedAt: new Date(point.recorded_at || ''),
      }));

      setEquityHistory(formattedHistory);
    } catch (error) {
      console.error('Error fetching equity history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, days]);

  useEffect(() => {
    fetchEquityHistory();

    const channel = supabase
      .channel('equity-history-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'equity_history',
        },
        () => {
          fetchEquityHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchEquityHistory]);

  return { equityHistory, isLoading, refetch: fetchEquityHistory };
}

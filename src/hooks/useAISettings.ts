import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AISettings {
  id: string;
  enabled: boolean;
  tradingMode: 'paper' | 'live';
  botStatus: 'idle' | 'learning' | 'trading';
  currentRegime: 'trending' | 'ranging' | 'high_volatility' | 'low_volatility' | 'news_driven';
  maxCapitalUsage: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxConcurrentTrades: number;
  allowedMarkets: string[];
  updatedAt: Date;
}

export function useAISettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          id: data.id,
          enabled: data.enabled || false,
          tradingMode: (data.trading_mode as 'paper' | 'live') || 'paper',
          botStatus: (data.bot_status as 'idle' | 'learning' | 'trading') || 'idle',
          currentRegime: (data.current_regime as AISettings['currentRegime']) || 'ranging',
          maxCapitalUsage: Number(data.max_capital_usage) || 80,
          maxPositionSize: Number(data.max_position_size) || 10,
          maxDailyLoss: Number(data.max_daily_loss) || 5,
          maxConcurrentTrades: data.max_concurrent_trades || 5,
          allowedMarkets: data.allowed_markets || ['crypto'],
          updatedAt: new Date(data.updated_at || ''),
        });
      }
    } catch (error) {
      console.error('Error fetching AI settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSettings();

    const channel = supabase
      .channel(`ai-settings-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_settings',
        },
        () => {
          fetchSettings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSettings]);

  return { settings, isLoading, refetch: fetchSettings };
}

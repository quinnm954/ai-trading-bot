import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// =============================================================================
// Risk Manager Hook - Client-side interface to RiskManager edge function
// =============================================================================

export interface RiskSettings {
  enabled: boolean;
  tradingMode: 'paper' | 'live';
  killSwitchActive: boolean;
  maxPositionSize: number;
  maxDailyLoss: number;
  weeklyLossLimit: number;
  maxDrawdown: number;
  maxConcurrentTrades: number;
  maxCapitalUsage: number;
  maxLeverage: number;
  dailyLossToday: number;
  weeklyLossCurrent: number;
  currentDrawdown: number;
  peakEquity: number;
  killSwitchTriggeredAt: string | null;
  liveModeConfirmedAt: string | null;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive' | 'ultra_aggressive';
  targetEquity: number;
}

export interface RiskEvent {
  id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details: any;
  created_at: string;
}

export interface RiskMetrics {
  dailyLossPercent: number;
  weeklyLossPercent: number;
  drawdownPercent: number;
  isKillSwitchActive: boolean;
  isTradingEnabled: boolean;
}

export interface RiskStatus {
  settings: RiskSettings;
  recentEvents: RiskEvent[];
  riskMetrics: RiskMetrics;
}

export function useRiskManager() {
  const { user } = useAuth();
  const [riskStatus, setRiskStatus] = useState<RiskStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current risk status
  const fetchRiskStatus = useCallback(async () => {
    if (!user) return;

    try {
      setIsLoading(true);
      setError(null);

      // Get current equity for calculations
      const { data: paperAccount } = await supabase
        .from('paper_account')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: liveAccount } = await supabase
        .from('live_account')
        .select('equity')
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: settings } = await supabase
        .from('ai_settings')
        .select('trading_mode')
        .eq('user_id', user.id)
        .maybeSingle();

      const currentEquity = settings?.trading_mode === 'live' 
        ? (liveAccount?.equity || 0)
        : (paperAccount?.balance || 100000);

      const response = await supabase.functions.invoke('risk-manager', {
        body: {
          action: 'get_risk_status',
          userId: user.id,
          currentEquity,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setRiskStatus(response.data);
    } catch (err) {
      console.error('Failed to fetch risk status:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch risk status');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Reset kill switch
  const resetKillSwitch = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const response = await supabase.functions.invoke('risk-manager', {
        body: {
          action: 'reset_kill_switch',
          userId: user.id,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Refetch status
      await fetchRiskStatus();
      return true;
    } catch (err) {
      console.error('Failed to reset kill switch:', err);
      setError(err instanceof Error ? err.message : 'Failed to reset kill switch');
      return false;
    }
  }, [user, fetchRiskStatus]);

  // Confirm live mode with phrase
  const confirmLiveMode = useCallback(async (confirmationPhrase: string): Promise<{ success: boolean; error?: string }> => {
    if (!user) return { success: false, error: 'Not authenticated' };

    try {
      const response = await supabase.functions.invoke('risk-manager', {
        body: {
          action: 'confirm_live_mode',
          userId: user.id,
          confirmationPhrase,
        },
      });

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      if (!response.data.success) {
        return { success: false, error: response.data.error };
      }

      // Refetch status
      await fetchRiskStatus();
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to confirm live mode';
      return { success: false, error: errorMsg };
    }
  }, [user, fetchRiskStatus]);

  // Update risk settings
  const updateRiskSettings = useCallback(async (updates: Partial<RiskSettings>): Promise<boolean> => {
    if (!user) return false;

    try {
      // Map camelCase to snake_case for database
      const dbUpdates: Record<string, any> = {};
      if (updates.maxPositionSize !== undefined) dbUpdates.max_position_size = updates.maxPositionSize;
      if (updates.maxDailyLoss !== undefined) dbUpdates.max_daily_loss = updates.maxDailyLoss;
      if (updates.weeklyLossLimit !== undefined) dbUpdates.weekly_loss_limit = updates.weeklyLossLimit;
      if (updates.maxDrawdown !== undefined) dbUpdates.max_drawdown = updates.maxDrawdown;
      if (updates.maxConcurrentTrades !== undefined) dbUpdates.max_concurrent_trades = updates.maxConcurrentTrades;
      if (updates.maxCapitalUsage !== undefined) dbUpdates.max_capital_usage = updates.maxCapitalUsage;
      if (updates.maxLeverage !== undefined) dbUpdates.max_leverage = updates.maxLeverage;
      if (updates.riskTolerance !== undefined) dbUpdates.risk_tolerance = updates.riskTolerance;
      if (updates.targetEquity !== undefined) dbUpdates.target_equity = updates.targetEquity;

      const { error } = await supabase
        .from('ai_settings')
        .update(dbUpdates)
        .eq('user_id', user.id);

      if (error) throw error;

      await fetchRiskStatus();
      return true;
    } catch (err) {
      console.error('Failed to update risk settings:', err);
      return false;
    }
  }, [user, fetchRiskStatus]);

  // Initial fetch
  useEffect(() => {
    fetchRiskStatus();
  }, [fetchRiskStatus]);

  // Real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('risk-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_settings',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchRiskStatus();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'risk_events',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchRiskStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchRiskStatus]);

  return {
    riskStatus,
    isLoading,
    error,
    fetchRiskStatus,
    resetKillSwitch,
    confirmLiveMode,
    updateRiskSettings,
    // Convenience getters
    isKillSwitchActive: riskStatus?.settings.killSwitchActive || false,
    isTradingEnabled: riskStatus?.riskMetrics.isTradingEnabled || false,
    currentDrawdown: riskStatus?.riskMetrics.drawdownPercent || 0,
    dailyLossPercent: riskStatus?.riskMetrics.dailyLossPercent || 0,
    weeklyLossPercent: riskStatus?.riskMetrics.weeklyLossPercent || 0,
  };
}

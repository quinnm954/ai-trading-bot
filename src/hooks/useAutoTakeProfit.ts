import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useAISettings } from '@/hooks/useAISettings';
import { useToast } from '@/hooks/use-toast';

export function useAutoTakeProfit() {
  const { user } = useAuth();
  const { settings } = useAISettings();
  const { toast } = useToast();

  const runTakeProfitChecker = useCallback(async () => {
    if (!user) return;

    try {
      // Force refresh session to get fresh token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.log('No valid session for take-profit checker');
        return;
      }

      // Check if token is about to expire (within 60 seconds) and refresh
      const expiresAt = session.expires_at;
      const now = Math.floor(Date.now() / 1000);
      
      let accessToken = session.access_token;
      
      if (expiresAt && expiresAt - now < 60) {
        console.log('Token expiring soon, refreshing...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshData.session) {
          console.log('Failed to refresh session');
          return;
        }
        accessToken = refreshData.session.access_token;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-take-profit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        // Don't spam console on auth errors - user might have logged out
        if (response.status !== 401) {
          console.error('Take-profit API error:', response.status);
        }
        return;
      }

      const result = await response.json();

      if (result.takeProfitCount > 0) {
        toast({
          title: '🎯 Take Profit Hit!',
          description: `Closed ${result.takeProfitCount} position(s) with +${result.closedPositions?.[0]?.pnlPercent || '0.45'}% profit`,
        });
      }

      if (result.stopLossCount > 0) {
        toast({
          title: '🛑 Stop Loss Triggered',
          description: `Closed ${result.stopLossCount} position(s) to limit losses`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      // Silently handle errors to avoid spamming console
    }
  }, [user, toast]);

  // Run take-profit checker continuously when AI is enabled
  useEffect(() => {
    if (!settings?.enabled) return;

    console.log('🎯 Auto take-profit checker active');

    // Run immediately
    runTakeProfitChecker();

    // Run every 5 seconds
    const interval = setInterval(() => {
      runTakeProfitChecker();
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [settings?.enabled, runTakeProfitChecker]);

  return { runTakeProfitChecker };
}

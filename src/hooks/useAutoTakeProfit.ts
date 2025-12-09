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
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-take-profit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

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
      console.error('Take-profit checker error:', error);
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

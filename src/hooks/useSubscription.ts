import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { MONTHLY_PRICE_USD, TRIAL_DAYS } from '@/lib/pricing';

/**
 * Single plan model: you either have access (paid, invited, or admin) or you don't.
 * During the 7-day trial, paper-trading features are available.
 */
export type Feature =
  | 'paper_trading'
  | 'ai_advisor'
  | 'basic_strategies'
  | 'live_trading'
  | 'single_broker'
  | 'autonomous_trading'
  | 'risk_management'
  | 'unlimited_brokers'
  | 'moonshot_scanner'
  | 'ai_learning_engine'
  | 'priority_support';

/** Features usable during the free trial (paper only). */
export const TRIAL_ALLOWED_FEATURES: Feature[] = [
  'paper_trading',
  'ai_advisor',
  'basic_strategies',
];

export const PRICE_USD = MONTHLY_PRICE_USD;

interface SubscriptionState {
  subscribed: boolean;
  subscriptionEnd: string | null;
  isFreeAccess: boolean;
  isLoading: boolean;
  error: string | null;
  cancelAtPeriodEnd: boolean;
  trialStartedAt: string | null;
  trialDaysRemaining: number;
  isTrialExpired: boolean;
  isInTrial: boolean;
}

function calculateTrialDaysRemaining(trialStartedAt: string | null): number {
  if (!trialStartedAt) return 0;
  const startDate = new Date(trialStartedAt);
  const now = new Date();
  const daysPassed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, TRIAL_DAYS - daysPassed);
}

export function useSubscription() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    subscriptionEnd: null,
    isFreeAccess: false,
    isLoading: true,
    error: null,
    cancelAtPeriodEnd: false,
    trialStartedAt: null,
    trialDaysRemaining: TRIAL_DAYS,
    isTrialExpired: false,
    isInTrial: true,
  });

  const checkSubscription = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        subscribed: false,
        trialStartedAt: null,
        trialDaysRemaining: 0,
        isTrialExpired: true,
        isInTrial: false,
      }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, has_free_access, trial_started_at')
        .eq('user_id', user.id)
        .maybeSingle();

      const trialStartedAt = (roleData as any)?.trial_started_at || null;
      const trialDaysRemaining = calculateTrialDaysRemaining(trialStartedAt);
      const isTrialExpired = trialDaysRemaining <= 0;
      const hasFreeAccess = roleData?.has_free_access || false;

      // Admin / invited users bypass billing entirely
      if (hasFreeAccess) {
        setState({
          subscribed: true,
          subscriptionEnd: null,
          isFreeAccess: true,
          isLoading: false,
          error: null,
          cancelAtPeriodEnd: false,
          trialStartedAt,
          trialDaysRemaining,
          isTrialExpired: false,
          isInTrial: false,
        });
        return;
      }

      if (subData && subData.status === 'active') {
        const periodEnd = subData.current_period_end;
        const isActive = !periodEnd || new Date(periodEnd) > new Date();

        if (isActive) {
          setState({
            subscribed: true,
            subscriptionEnd: periodEnd,
            isFreeAccess: false,
            isLoading: false,
            error: null,
            cancelAtPeriodEnd: subData.cancel_at_period_end || false,
            trialStartedAt,
            trialDaysRemaining,
            isTrialExpired: false,
            isInTrial: false,
          });
          return;
        }
      }

      setState({
        subscribed: false,
        subscriptionEnd: null,
        isFreeAccess: false,
        isLoading: false,
        error: null,
        cancelAtPeriodEnd: false,
        trialStartedAt,
        trialDaysRemaining,
        isTrialExpired,
        isInTrial: !isTrialExpired,
      });
    } catch (error) {
      console.error('Error checking subscription:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to check subscription',
      }));
    }
  }, [isAuthenticated, user]);

  // Ask the backend to reconcile with the payment provider, then refresh locally
  const syncWithProvider = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      await supabase.functions.invoke('check-subscription');
    } catch (error) {
      console.error('check-subscription failed:', error);
    }
    await checkSubscription();
  }, [isAuthenticated, checkSubscription]);

  useEffect(() => {
    if (!authLoading) {
      checkSubscription();
    }
  }, [authLoading, checkSubscription]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(checkSubscription, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, checkSubscription]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const channel = supabase
      .channel(`subscription-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          checkSubscription();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, user, checkSubscription]);

  const canAccess = useCallback((feature: Feature): boolean => {
    if (state.isFreeAccess) return true;
    if (state.subscribed) return true;
    if (state.isInTrial && !state.isTrialExpired) {
      return TRIAL_ALLOWED_FEATURES.includes(feature);
    }
    return false;
  }, [state.isFreeAccess, state.subscribed, state.isInTrial, state.isTrialExpired]);

  /** No broker limits on the single plan — subscribers get unlimited connections. */
  const canAddBroker = useCallback((_currentBrokerCount: number): boolean => {
    return state.isFreeAccess || state.subscribed;
  }, [state.isFreeAccess, state.subscribed]);

  return {
    ...state,
    priceUsd: MONTHLY_PRICE_USD,
    checkSubscription,
    syncWithProvider,
    canAccess,
    canAddBroker,
  };
}

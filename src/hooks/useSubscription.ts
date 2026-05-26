import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type SubscriptionTier = 'free' | 'pro' | 'unlimited';

const TRIAL_DAYS = 7;

interface SubscriptionState {
  tier: SubscriptionTier;
  subscribed: boolean;
  subscriptionEnd: string | null;
  isFreeAccess: boolean;
  isLoading: boolean;
  error: string | null;
  cancelAtPeriodEnd: boolean;
  // Trial state
  trialStartedAt: string | null;
  trialDaysRemaining: number;
  isTrialExpired: boolean;
  isInTrial: boolean;
}

// Cash App pricing per tier (USD, 30-day access)
export const TIER_PRICING = {
  pro: 49,
  unlimited: 99,
} as const;

// Feature definitions by tier
export const TIER_FEATURES = {
  free: [
    'paper_trading',
    'ai_advisor',
    'basic_strategies',
  ],
  pro: [
    'paper_trading',
    'ai_advisor',
    'basic_strategies',
    'live_trading',
    'single_broker',
    'autonomous_trading',
    'risk_management',
  ],
  unlimited: [
    'paper_trading',
    'ai_advisor',
    'basic_strategies',
    'live_trading',
    'single_broker',
    'autonomous_trading',
    'risk_management',
    'unlimited_brokers',
    'moonshot_scanner',
    'ai_learning_engine',
    'priority_support',
  ],
} as const;

export type Feature = typeof TIER_FEATURES.unlimited[number];

// Calculate days remaining from trial start
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
    tier: 'free',
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
        tier: 'free', 
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

      // First check local database for subscription
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      // Check for free access and trial_started_at via user_roles
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, has_free_access, trial_started_at')
        .eq('user_id', user.id)
        .maybeSingle();

      const trialStartedAt = (roleData as any)?.trial_started_at || null;
      const trialDaysRemaining = calculateTrialDaysRemaining(trialStartedAt);
      const isTrialExpired = trialDaysRemaining <= 0;
      const hasFreeAccess = roleData?.has_free_access || false;

      // If user has free access (admin/invited), bypass everything
      if (hasFreeAccess) {
        setState({
          tier: 'unlimited',
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

      // Check for active subscription
      if (subData && subData.status === 'active') {
        const periodEnd = subData.current_period_end;
        const isActive = !periodEnd || new Date(periodEnd) > new Date();
        
        if (isActive) {
          setState({
            tier: subData.tier as SubscriptionTier,
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

      // No active subscription - reflect trial status
      setState({
        tier: 'free',
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

  useEffect(() => {
    if (!authLoading) {
      checkSubscription();
    }
  }, [authLoading, checkSubscription]);

  // Auto-refresh subscription status every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(checkSubscription, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, checkSubscription]);

  // Listen for realtime subscription changes
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

  // Check if user has access to a specific feature
  const canAccess = useCallback((feature: Feature): boolean => {
    // Free access users can access everything
    if (state.isFreeAccess) return true;
    
    // Subscribed users get access based on tier
    if (state.subscribed) {
      const tierFeatures = TIER_FEATURES[state.tier] as readonly Feature[];
      return tierFeatures.includes(feature);
    }
    
    // Trial users can access free tier features only if trial is active
    if (state.isInTrial && !state.isTrialExpired) {
      const freeFeatures = TIER_FEATURES.free as readonly Feature[];
      return freeFeatures.includes(feature);
    }
    
    // Trial expired - no access to anything
    return false;
  }, [state.tier, state.isFreeAccess, state.subscribed, state.isInTrial, state.isTrialExpired]);

  // Get required tier for a feature
  const getRequiredTier = useCallback((feature: Feature): SubscriptionTier => {
    const freeFeatures: Feature[] = ['paper_trading', 'ai_advisor', 'basic_strategies'];
    const proFeatures: Feature[] = ['live_trading', 'single_broker', 'autonomous_trading', 'risk_management'];
    
    if (freeFeatures.includes(feature)) return 'free';
    if (proFeatures.includes(feature)) return 'pro';
    return 'unlimited';
  }, []);

  // Check broker limit
  const canAddBroker = useCallback((currentBrokerCount: number): boolean => {
    if (state.isFreeAccess || state.tier === 'unlimited') return true;
    if (state.tier === 'pro') return currentBrokerCount < 1;
    return false; // Free tier can't add brokers
  }, [state.tier, state.isFreeAccess]);

  return {
    ...state,
    checkSubscription,
    canAccess,
    getRequiredTier,
    canAddBroker,
  };
}

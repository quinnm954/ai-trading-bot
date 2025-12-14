import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type SubscriptionTier = 'free' | 'pro' | 'unlimited';

interface SubscriptionState {
  tier: SubscriptionTier;
  subscribed: boolean;
  subscriptionEnd: string | null;
  isFreeAccess: boolean;
  isLoading: boolean;
  error: string | null;
  cancelAtPeriodEnd: boolean;
}

// Stripe price IDs for each tier
export const STRIPE_PRICES = {
  pro: 'price_1SeNc7KE5ARVDE0Hv8zWXyv1',
  unlimited: 'price_1SeNcHKE5ARVDE0HesKLJA23',
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
  });

  const checkSubscription = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setState(prev => ({ ...prev, isLoading: false, tier: 'free', subscribed: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      // First check local database for subscription
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Check for free access via user_roles
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, has_free_access')
        .eq('user_id', user.id)
        .single();

      if (roleData?.has_free_access) {
        setState({
          tier: 'unlimited',
          subscribed: true,
          subscriptionEnd: null,
          isFreeAccess: true,
          isLoading: false,
          error: null,
          cancelAtPeriodEnd: false,
        });
        return;
      }

      if (subData && subData.status === 'active') {
        const periodEnd = subData.current_period_end;
        const isActive = !periodEnd || new Date(periodEnd) > new Date();
        
        setState({
          tier: (isActive ? subData.tier : 'free') as SubscriptionTier,
          subscribed: isActive,
          subscriptionEnd: periodEnd,
          isFreeAccess: false,
          isLoading: false,
          error: null,
          cancelAtPeriodEnd: subData.cancel_at_period_end || false,
        });
        return;
      }

      // Fallback to Stripe check if no local data
      const { data, error } = await supabase.functions.invoke('check-subscription');

      if (error) throw error;

      setState({
        tier: data.tier || 'free',
        subscribed: data.subscribed || false,
        subscriptionEnd: data.subscription_end || null,
        isFreeAccess: data.is_free_access || false,
        isLoading: false,
        error: null,
        cancelAtPeriodEnd: false,
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

  // Auto-refresh subscription status every minute
  useEffect(() => {
    if (!isAuthenticated) return;

    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, checkSubscription]);

  // Check if user has access to a specific feature
  const canAccess = useCallback((feature: Feature): boolean => {
    if (state.isFreeAccess) return true;
    const tierFeatures = TIER_FEATURES[state.tier] as readonly Feature[];
    return tierFeatures.includes(feature);
  }, [state.tier, state.isFreeAccess]);

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

  const startCheckout = async (tier: 'pro' | 'unlimited') => {
    if (!isAuthenticated) {
      throw new Error('Please sign in to subscribe');
    }

    const priceId = STRIPE_PRICES[tier];

    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { priceId },
    });

    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank');
    }
  };

  const openCustomerPortal = async () => {
    const { data, error } = await supabase.functions.invoke('customer-portal');

    if (error) throw error;
    if (data?.url) {
      window.open(data.url, '_blank');
    }
  };

  return {
    ...state,
    checkSubscription,
    startCheckout,
    openCustomerPortal,
    canAccess,
    getRequiredTier,
    canAddBroker,
  };
}

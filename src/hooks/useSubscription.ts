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
}

// Stripe price IDs for each tier
export const STRIPE_PRICES = {
  pro: 'price_1SeNc7KE5ARVDE0Hv8zWXyv1',
  unlimited: 'price_1SeNcHKE5ARVDE0HesKLJA23',
} as const;

export function useSubscription() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [state, setState] = useState<SubscriptionState>({
    tier: 'free',
    subscribed: false,
    subscriptionEnd: null,
    isFreeAccess: false,
    isLoading: true,
    error: null,
  });

  const checkSubscription = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setState(prev => ({ ...prev, isLoading: false, tier: 'free', subscribed: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const { data, error } = await supabase.functions.invoke('check-subscription');

      if (error) throw error;

      setState({
        tier: data.tier || 'free',
        subscribed: data.subscribed || false,
        subscriptionEnd: data.subscription_end || null,
        isFreeAccess: data.is_free_access || false,
        isLoading: false,
        error: null,
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
  };
}

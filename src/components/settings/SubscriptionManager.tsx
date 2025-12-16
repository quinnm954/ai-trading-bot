import { useState } from 'react';
import { CreditCard, Crown, Zap, RefreshCw, ExternalLink, Calendar, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSubscription, SubscriptionTier } from '@/hooks/useSubscription';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { toast } from 'sonner';
import { format } from 'date-fns';

const tierConfig: Record<SubscriptionTier, { label: string; icon: typeof Crown; color: string }> = {
  free: { label: 'Free', icon: Zap, color: 'bg-muted text-muted-foreground' },
  pro: { label: 'Pro', icon: Crown, color: 'bg-primary text-primary-foreground' },
  unlimited: { label: 'Unlimited', icon: Crown, color: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' },
};

export function SubscriptionManager() {
  const {
    tier,
    subscribed,
    subscriptionEnd,
    isFreeAccess,
    isLoading,
    cancelAtPeriodEnd,
    checkSubscription,
    startCheckout,
    openCustomerPortal,
  } = useSubscription();

  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const isCreatorAdmin = isAdmin;

  const [refreshing, setRefreshing] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const config = tierConfig[tier];
  const TierIcon = config.icon;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await checkSubscription();
      toast.success('Subscription status refreshed');
    } catch (error) {
      toast.error('Failed to refresh subscription status');
    } finally {
      setRefreshing(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      await openCustomerPortal();
    } catch (error) {
      toast.error('Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleUpgrade = async (targetTier: 'pro' | 'unlimited') => {
    try {
      await startCheckout(targetTier);
    } catch (error) {
      toast.error('Failed to start checkout');
    }
  };

  if (isLoading || isAdminLoading) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-6">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Subscription & Billing</h3>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-20 bg-secondary/50 rounded-lg" />
          <div className="h-10 bg-secondary/50 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Subscription & Billing</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          className="gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Current Plan */}
      <div className="p-4 rounded-lg bg-secondary/30 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${config.color}`}>
              <TierIcon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">Current Plan</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-foreground">{config.label}</span>
                {isCreatorAdmin ? (
                  <Badge variant="secondary" className="text-xs">
                    Creator Admin
                  </Badge>
                ) : isFreeAccess ? (
                  <Badge variant="secondary" className="text-xs">
                    Invited User
                  </Badge>
                ) : null}
                {cancelAtPeriodEnd && (
                  <Badge variant="destructive" className="text-xs">
                    Canceling
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {subscribed && !isFreeAccess && (
            <div className="flex items-center gap-1 text-success">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">Active</span>
            </div>
          )}
        </div>

        {subscriptionEnd && !isFreeAccess && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
            <Calendar className="w-4 h-4" />
            <span>
              {cancelAtPeriodEnd ? 'Access until' : 'Renews on'}{' '}
              {format(new Date(subscriptionEnd), 'MMM d, yyyy')}
            </span>
          </div>
        )}

        {isCreatorAdmin ? (
          <p className="text-sm text-muted-foreground mt-2">
            You have full access to all features as the creator admin account.
          </p>
        ) : isFreeAccess ? (
          <p className="text-sm text-muted-foreground mt-2">
            You have full access to all features through an invite.
          </p>
        ) : null}
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {subscribed && !isFreeAccess && (
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleManageSubscription}
            disabled={portalLoading}
          >
            <ExternalLink className="w-4 h-4" />
            {portalLoading ? 'Opening...' : 'Manage Subscription'}
          </Button>
        )}

        {tier === 'free' && !isFreeAccess && (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="default"
              className="gap-2"
              onClick={() => handleUpgrade('pro')}
            >
              <Crown className="w-4 h-4" />
              Upgrade to Pro
            </Button>
            <Button
              variant="glow"
              className="gap-2"
              onClick={() => handleUpgrade('unlimited')}
            >
              <Crown className="w-4 h-4" />
              Go Unlimited
            </Button>
          </div>
        )}

        {tier === 'pro' && !isFreeAccess && (
          <Button
            variant="glow"
            className="w-full gap-2"
            onClick={() => handleUpgrade('unlimited')}
          >
            <Crown className="w-4 h-4" />
            Upgrade to Unlimited
          </Button>
        )}
      </div>

      {/* Feature Summary */}
      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-2">Your plan includes:</p>
        <div className="flex flex-wrap gap-2">
          {tier === 'free' && !isFreeAccess && (
            <>
              <Badge variant="secondary" className="text-xs">Paper Trading</Badge>
              <Badge variant="secondary" className="text-xs">AI Advisor</Badge>
              <Badge variant="secondary" className="text-xs">Basic Strategies</Badge>
            </>
          )}
          {tier === 'pro' && !isFreeAccess && (
            <>
              <Badge variant="secondary" className="text-xs">Live Trading</Badge>
              <Badge variant="secondary" className="text-xs">1 Broker</Badge>
              <Badge variant="secondary" className="text-xs">AI Trading</Badge>
              <Badge variant="secondary" className="text-xs">Risk Management</Badge>
            </>
          )}
          {(tier === 'unlimited' || isFreeAccess) && (
            <>
              <Badge variant="secondary" className="text-xs">All Features</Badge>
              <Badge variant="secondary" className="text-xs">Unlimited Brokers</Badge>
              <Badge variant="secondary" className="text-xs">Moonshot Scanner</Badge>
              <Badge variant="secondary" className="text-xs">AI Learning</Badge>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

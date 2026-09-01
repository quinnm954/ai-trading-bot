import { useState } from 'react';
import { CreditCard, Crown, RefreshCw, Calendar, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSubscription } from '@/hooks/useSubscription';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { CryptoPayButton } from '@/components/subscription/CryptoPayButton';
import { MONTHLY_PRICE_USD, PLAN_NAME, PLAN_FEATURES } from '@/lib/pricing';
import { toast } from 'sonner';
import { format } from 'date-fns';

export function SubscriptionManager() {
  const {
    subscribed,
    subscriptionEnd,
    isFreeAccess,
    isLoading,
    cancelAtPeriodEnd,
    syncWithProvider,
  } = useSubscription();

  const { isAdmin, isLoading: isAdminLoading } = useIsAdmin();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await syncWithProvider();
      toast.success('Subscription status refreshed');
    } catch {
      toast.error('Failed to refresh subscription status');
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoading || isAdminLoading) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-6">
          <CreditCard className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Subscription & Billing</h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-20 rounded-lg bg-secondary/40" />
          <div className="h-10 rounded-lg bg-secondary/40" />
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
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={refreshing ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          Refresh
        </Button>
      </div>

      <div className="p-4 rounded-lg bg-secondary/30 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/20 text-primary">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">Current Plan</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-foreground">
                  {subscribed ? PLAN_NAME : 'Free Trial'}
                </span>
                {isAdmin ? (
                  <Badge variant="secondary" className="text-xs">Creator Admin</Badge>
                ) : isFreeAccess ? (
                  <Badge variant="secondary" className="text-xs">Invited User</Badge>
                ) : null}
                {cancelAtPeriodEnd && (
                  <Badge variant="destructive" className="text-xs">Cancels at period end</Badge>
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
              {cancelAtPeriodEnd ? 'Access ends' : 'Renews'} {format(new Date(subscriptionEnd), 'MMM d, yyyy')}
            </span>
          </div>
        )}

        {isAdmin ? (
          <p className="text-sm text-muted-foreground mt-2">
            You have full access to all features as the creator admin account.
          </p>
        ) : isFreeAccess ? (
          <p className="text-sm text-muted-foreground mt-2">
            You have full access to all features through an invite.
          </p>
        ) : !subscribed ? (
          <p className="text-sm text-muted-foreground mt-2">
            ${MONTHLY_PRICE_USD}/month for unlimited use, paid in USDC straight from your wallet.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">
            ${MONTHLY_PRICE_USD} per 30 days, paid in USDC. Nothing auto-charges — pay again to extend.
          </p>
        )}
      </div>

      <div className="space-y-3">
        {!subscribed && !isFreeAccess && <CryptoPayButton />}

        {subscribed && !isFreeAccess && (
          <CryptoPayButton
            variant="outline"
            label="Extend by another 30 days"
            showPrice={false}
          />
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-2">
          {subscribed || isFreeAccess ? 'Your plan includes:' : `${PLAN_NAME} includes:`}
        </p>
        <div className="flex flex-wrap gap-2">
          {PLAN_FEATURES.slice(0, 6).map((f) => (
            <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Zap, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSubscription, Feature, SubscriptionTier } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

interface UpgradePromptProps {
  feature: Feature;
  title?: string;
  description?: string;
  className?: string;
  variant?: 'card' | 'inline' | 'banner';
}

const FEATURE_NAMES: Record<Feature, string> = {
  paper_trading: 'Paper Trading',
  ai_advisor: 'AI Strategy Advisor',
  basic_strategies: 'Trading Strategies',
  live_trading: 'Live Trading',
  single_broker: 'Broker Connection',
  autonomous_trading: 'Autonomous AI Trading',
  risk_management: 'Advanced Risk Management',
  unlimited_brokers: 'Unlimited Brokers',
  moonshot_scanner: 'Moonshot Scanner',
  ai_learning_engine: 'AI Learning Engine',
  priority_support: 'Priority Support',
};

const TIER_LABELS: Record<SubscriptionTier, { label: string; icon: typeof Zap }> = {
  free: { label: 'Free', icon: Lock },
  pro: { label: 'Pro', icon: Zap },
  unlimited: { label: 'Unlimited', icon: Crown },
};

export function UpgradePrompt({
  feature,
  title,
  description,
  className,
  variant = 'card',
}: UpgradePromptProps) {
  const { getRequiredTier, startCheckout, isLoading: subLoading } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  
  const requiredTier = getRequiredTier(feature);
  const featureName = FEATURE_NAMES[feature];
  const tierInfo = TIER_LABELS[requiredTier];
  const TierIcon = tierInfo.icon;

  const handleUpgrade = async () => {
    if (requiredTier === 'free') return;
    
    try {
      setCheckoutLoading(true);
      await startCheckout(requiredTier as 'pro' | 'unlimited');
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setCheckoutLoading(false);
    }
  };

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        <Lock className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">
          {title || `${featureName} requires ${tierInfo.label}`}
        </span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-primary"
          onClick={handleUpgrade}
          disabled={checkoutLoading || subLoading}
        >
          {checkoutLoading ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : null}
          Upgrade
        </Button>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        className={cn(
          'flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <TierIcon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              {title || `Unlock ${featureName}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {description || `Upgrade to ${tierInfo.label} to access this feature`}
            </p>
          </div>
        </div>
        <Button
          variant="glow"
          size="sm"
          onClick={handleUpgrade}
          disabled={checkoutLoading || subLoading}
          className="gap-2"
        >
          {checkoutLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Upgrade to {tierInfo.label}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    );
  }

  // Card variant (default)
  return (
    <Card className={cn('border-primary/20 bg-gradient-to-br from-primary/5 to-transparent', className)}>
      <CardHeader className="text-center pb-4">
        <div className="mx-auto p-3 rounded-full bg-primary/20 w-fit mb-4">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <CardTitle className="text-xl">
          {title || `${featureName} Locked`}
        </CardTitle>
        <CardDescription>
          {description || `This feature requires a ${tierInfo.label} subscription`}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <Button
          variant="glow"
          size="lg"
          onClick={handleUpgrade}
          disabled={checkoutLoading || subLoading}
          className="gap-2"
        >
          {checkoutLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <TierIcon className="w-4 h-4" />
              Upgrade to {tierInfo.label}
            </>
          )}
        </Button>
        <p className="text-sm text-muted-foreground">
          or{' '}
          <Link to="/pricing" className="text-primary hover:underline">
            view all plans
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

// Higher-order component to wrap features with subscription check
interface FeatureGateProps {
  feature: Feature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { canAccess, isLoading } = useSubscription();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!canAccess(feature)) {
    return fallback || <UpgradePrompt feature={feature} />;
  }

  return <>{children}</>;
}

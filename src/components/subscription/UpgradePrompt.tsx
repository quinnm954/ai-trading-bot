import { Link } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Feature } from '@/hooks/useSubscription';
import { CryptoPayButton } from './CryptoPayButton';
import { MONTHLY_PRICE_USD, PLAN_NAME } from '@/lib/pricing';
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
  ai_learning_engine: 'AI Learning Engine',
  priority_support: 'Priority Support',
};

export function UpgradePrompt({
  feature,
  title,
  description,
  className,
  variant = 'card',
}: UpgradePromptProps) {
  const featureName = FEATURE_NAMES[feature];

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        <Lock className="w-4 h-4 text-muted-foreground" />
        <span className="text-muted-foreground">
          {title || `${featureName} requires ${PLAN_NAME}`}
        </span>
        <Button variant="link" size="sm" className="h-auto p-0 text-primary" asChild>
          <Link to="/pricing">Get access</Link>
        </Button>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg border border-primary/20 bg-primary/5',
          className
        )}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <Lock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">
              {title || `Unlock ${featureName}`}
            </p>
            <p className="text-sm text-muted-foreground">
              {description || `${PLAN_NAME} — $${MONTHLY_PRICE_USD}/month, everything included`}
            </p>
          </div>
        </div>
        <Button variant="glow" size="sm" className="gap-2 shrink-0" asChild>
          <Link to="/pricing">
            Get Full Access
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>
    );
  }

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
          {description || `Included in ${PLAN_NAME} — $${MONTHLY_PRICE_USD}/month`}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <CryptoPayButton />
        <p className="text-sm text-muted-foreground">
          or{' '}
          <Link to="/pricing" className="text-primary hover:underline">
            see what's included
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

interface FeatureGateProps {
  feature: Feature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  // Subscriptions disabled during testing — all features unlocked.
  return <>{children}</>;
}

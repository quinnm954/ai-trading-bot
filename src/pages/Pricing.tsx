import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Check, Zap, Crown, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
const tiers = [
  {
    name: 'Free',
    description: 'Practice trading with virtual money',
    price: 0,
    period: 'forever',
    features: [
      'Unlimited paper trading',
      '$100k virtual balance',
      'All trading strategies',
      'AI market analysis',
      'Real-time market data',
      'Performance tracking',
    ],
    cta: 'Start Free',
    icon: Sparkles,
    popular: false,
    gradient: 'from-muted to-muted/50',
  },
  {
    name: 'Pro',
    description: 'Live trading with 1 exchange',
    price: 49,
    period: '/month',
    features: [
      'Everything in Free',
      'Live trading with real money',
      '1 exchange connection',
      'Autonomous AI trader',
      'Auto take-profit & stop-loss',
      '24/7 automated execution',
      'Email support',
    ],
    cta: 'Get Pro',
    icon: Zap,
    popular: true,
    gradient: 'from-primary to-primary/50',
  },
  {
    name: 'Unlimited',
    description: 'Maximum power, all exchanges',
    price: 99,
    period: '/month',
    features: [
      'Everything in Pro',
      'All 8 exchanges supported',
      'Priority AI processing',
      'Advanced learning engine',
      'Custom strategy builder',
      'Priority support',
      'Early access to features',
    ],
    cta: 'Go Unlimited',
    icon: Crown,
    popular: false,
    gradient: 'from-amber-500 to-amber-500/50',
  },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const handleSelectPlan = (tierName: string) => {
    if (!isAuthenticated) {
      navigate('/auth');
    } else {
      // For now, just navigate to settings - Stripe integration would go here
      navigate('/settings');
    }
  };

  // Admin gets all features free
  if (isAuthenticated && isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-foreground">
                Titan<span className="text-primary">AI</span>
              </span>
            </Link>
            <Button variant="outline" asChild>
              <Link to="/">Dashboard</Link>
            </Button>
          </div>
        </header>
        <main className="container mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 text-primary mb-6">
            <Crown className="w-5 h-5" />
            Creator Account
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">
            All Features Unlocked
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            You have full access to all features as the creator account.
          </p>
          <Button variant="glow" asChild>
            <Link to="/">Go to Dashboard</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to={isAuthenticated ? '/' : '/auth'} className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">
              Titan<span className="text-primary">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <Button variant="outline" asChild>
                <Link to="/">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild>
                  <Link to="/auth">Sign In</Link>
                </Button>
                <Button variant="glow" asChild>
                  <Link to="/auth">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Choose Your Trading Power
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Start free with paper trading, upgrade when you're ready for real profits
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-4 mb-12">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              billingPeriod === 'monthly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingPeriod('yearly')}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              billingPeriod === 'yearly'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            Yearly
            <span className="ml-2 px-2 py-0.5 text-xs bg-profit/20 text-profit rounded-full">
              Save 20%
            </span>
          </button>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {tiers.map((tier) => {
            const displayPrice = billingPeriod === 'yearly' && tier.price > 0 
              ? Math.round(tier.price * 0.8) 
              : tier.price;
            
            return (
              <div
                key={tier.name}
                className={cn(
                  'relative glass-panel p-8 rounded-2xl border transition-all duration-300 hover:scale-[1.02]',
                  tier.popular
                    ? 'border-primary shadow-lg shadow-primary/20'
                    : 'border-border'
                )}
              >
                {tier.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-sm font-medium rounded-full">
                    Most Popular
                  </div>
                )}

                <div className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center mb-6 bg-gradient-to-br',
                  tier.gradient
                )}>
                  <tier.icon className="w-6 h-6 text-foreground" />
                </div>

                <h3 className="text-2xl font-bold text-foreground mb-2">
                  {tier.name}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {tier.description}
                </p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-foreground">
                    ${displayPrice}
                  </span>
                  <span className="text-muted-foreground">
                    {tier.price === 0 ? tier.period : billingPeriod === 'yearly' ? '/month' : tier.period}
                  </span>
                </div>

                {billingPeriod === 'yearly' && tier.price > 0 && (
                  <p className="text-sm text-profit mb-4">
                    Billed ${displayPrice * 12}/year
                  </p>
                )}

                <Button
                  variant={tier.popular ? 'glow' : 'outline'}
                  className="w-full mb-8 gap-2"
                  onClick={() => handleSelectPlan(tier.name)}
                >
                  {tier.cta}
                  <ArrowRight className="w-4 h-4" />
                </Button>

                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-profit shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* FAQ or Trust Section */}
        <div className="mt-20 text-center">
          <p className="text-muted-foreground">
            Questions? <Link to="/auth" className="text-primary hover:underline">Contact us</Link> or start with the free plan—no credit card required.
          </p>
        </div>
      </main>
    </div>
  );
}

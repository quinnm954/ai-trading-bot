import { Link } from 'react-router-dom';
import { Brain, Check, Sparkles, Crown, X, Wallet, Shield, Bot, Globe, ChevronDown, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCurrency } from '@/hooks/useCurrency';
import { useSubscription } from '@/hooks/useSubscription';
import { CryptoPayButton } from '@/components/subscription/CryptoPayButton';
import { PromoReel } from '@/components/marketing/PromoReel';

import {
  MONTHLY_PRICE_USD,
  PLAN_NAME,
  PLAN_FEATURES,
  TRIAL_FEATURES,
  TRIAL_LIMITATIONS,
  TRIAL_DAYS,
} from '@/lib/pricing';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const POPULAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'BRL', 'MXN', 'SGD'];

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { currency, formatPrice, changeCurrency, isLoading: currencyLoading } = useCurrency();
  const { subscribed, isFreeAccess } = useSubscription();

  const displayPrice = currency.code === 'USD'
    ? `$${MONTHLY_PRICE_USD}`
    : formatPrice(MONTHLY_PRICE_USD);

  const header = (
    <header className="border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/20">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <span className="text-xl font-bold text-foreground">
            Titan<span className="text-primary">AI</span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Globe className="w-4 h-4" />
                <span>{currency.code}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              {POPULAR_CURRENCIES.map((code) => (
                <DropdownMenuItem
                  key={code}
                  onClick={() => changeCurrency(code)}
                  className={cn(currency.code === code && 'bg-primary/10')}
                >
                  {code}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {isAuthenticated ? (
            <Button variant="outline" asChild>
              <Link to="/dashboard">Dashboard</Link>
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
  );

  if (isAuthenticated && (isAdmin || isFreeAccess)) {
    return (
      <div className="min-h-screen bg-background">
        {header}
        <main className="container mx-auto px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 text-primary mb-6">
            <Crown className="w-5 h-5" />
            {isAdmin ? 'Creator Account' : 'Invited Account'}
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">All Features Unlocked</h1>
          <p className="text-xl text-muted-foreground mb-8">
            You have full access to TitanAI at no charge.
          </p>
          <Button variant="glow" asChild>
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {header}

      <main className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/20 text-primary mb-6">
            <Sparkles className="w-4 h-4" />
            <span className="font-medium">
              Start with a {TRIAL_DAYS}-day free trial • No card required
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            One plan. Everything included.
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            No tiers, no add-ons, no broker limits. {displayPrice}/month for unlimited use of the
            entire AI trading system.
          </p>
        </div>

        <div className="max-w-2xl mx-auto mb-12">
          <PromoReel />
          <p className="text-center text-sm text-muted-foreground mt-3 inline-flex items-center justify-center gap-2 w-full">
            <Play className="w-4 h-4 text-primary" />
            30-second overview of how Titan AI trades for you.
          </p>
        </div>


        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-start">
          {/* Free trial */}
          <div className="glass-panel p-8 rounded-2xl border border-border">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 bg-gradient-to-br from-muted to-muted/50">
              <Sparkles className="w-6 h-6 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Free Trial</h2>
            <p className="text-muted-foreground mb-6">
              Explore the full paper-trading experience
            </p>
            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-bold text-foreground">
                {currency.code === 'USD' ? '$0' : formatPrice(0)}
              </span>
              <span className="text-muted-foreground">for {TRIAL_DAYS} days</span>
            </div>

            <ul className="space-y-3 mb-6">
              {TRIAL_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-profit shrink-0 mt-0.5" />
                  <span className="text-foreground">{f}</span>
                </li>
              ))}
              {TRIAL_LIMITATIONS.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <X className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
            </ul>

            <Button variant="outline" size="lg" className="w-full" asChild>
              <Link to={isAuthenticated ? '/dashboard' : '/auth'}>
                {isAuthenticated ? 'Go to Dashboard' : 'Start Free Trial'}
              </Link>
            </Button>
          </div>

          {/* Paid plan */}
          <div className="relative glass-panel p-8 rounded-2xl border border-primary shadow-lg shadow-primary/20">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground text-sm font-medium rounded-full">
              Unlimited Use
            </div>

            <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-6 bg-gradient-to-br from-primary to-primary/50">
              <Crown className="w-6 h-6 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">{PLAN_NAME}</h2>
            <p className="text-muted-foreground mb-6">
              The whole system, unlimited, for one flat price
            </p>
            <div className="flex items-baseline gap-1 mb-6">
              <span className={cn(
                'font-bold text-foreground',
                currencyLoading && 'animate-pulse',
                displayPrice.length > 8 ? 'text-2xl' : 'text-4xl'
              )}>
                {displayPrice}
              </span>
              <span className="text-muted-foreground">/month</span>
            </div>

            <ul className="space-y-3 mb-6">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className="w-4 h-4 text-profit shrink-0 mt-0.5" />
                  <span className="text-foreground">{f}</span>
                </li>
              ))}
            </ul>

            {subscribed ? (
              <Button variant="outline" size="lg" className="w-full" asChild>
                <Link to="/settings">Manage Subscription</Link>
              </Button>
            ) : isAuthenticated ? (
              <CryptoPayButton />
            ) : (
              <Button variant="glow" size="lg" className="w-full gap-2" asChild>
                <Link to="/auth">
                  <Wallet className="w-4 h-4" />
                  Create account to get access
                </Link>
              </Button>
            )}
          </div>
        </div>

        {/* Payment + trust strip */}
        <div className="max-w-4xl mx-auto mt-12 grid sm:grid-cols-3 gap-4">
          <div className="glass-panel p-5 rounded-xl flex items-start gap-3">
            <Wallet className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground text-sm">Pay in USDC, no processor</p>
              <p className="text-xs text-muted-foreground">
                Sent wallet-to-wallet from any crypto app. No card, no middleman.
              </p>
            </div>
          </div>
          <div className="glass-panel p-5 rounded-xl flex items-start gap-3">
            <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground text-sm">Nothing auto-charges</p>
              <p className="text-xs text-muted-foreground">
                Each payment buys 30 days. Stop paying and it simply lapses.
              </p>
            </div>
          </div>
          <div className="glass-panel p-5 rounded-xl flex items-start gap-3">
            <Bot className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground text-sm">Non-custodial</p>
              <p className="text-xs text-muted-foreground">
                Your funds stay at your own broker or exchange.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground max-w-2xl mx-auto mt-10">
          Trading involves risk of loss. TitanAI is a tool, not financial advice, and does not
          guarantee profits. Your subscription fee is separate from trading results — the dashboard
          shows your monthly profit net of the fee.
        </p>
      </main>
    </div>
  );
}

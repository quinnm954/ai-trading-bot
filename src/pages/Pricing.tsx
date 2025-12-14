import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Check, Zap, Crown, ArrowRight, Sparkles, Globe, ChevronDown, X, Shield, Bot, BarChart3, TrendingUp, Rocket, LineChart, Cpu, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCurrency } from '@/hooks/useCurrency';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const tiers = [
  {
    name: 'Free',
    description: 'Master trading risk-free with AI',
    priceUsd: 0,
    period: 'forever',
    features: [
      'Unlimited paper trading',
      '$100k virtual balance',
      'Stocks & crypto support',
      'All 8 trading strategies',
      'AI market regime detection',
      'Real-time price data',
      'AI Strategy Advisor',
      'Performance analytics',
      'Equity curve visualization',
      'Risk management dashboard',
    ],
    limitations: [
      'Paper trading only',
      'No live broker/exchange connections',
    ],
    cta: 'Start Free',
    icon: Sparkles,
    popular: false,
    gradient: 'from-muted to-muted/50',
  },
  {
    name: 'Pro',
    description: 'Live trading with 1 broker/exchange',
    priceUsd: 49,
    period: '/month',
    features: [
      'Everything in Free, plus:',
      'Live trading with real money',
      '1 broker or exchange connection',
      'Stocks & crypto trading',
      'Fully autonomous AI trader',
      'User-confirmed trade mode',
      'Auto take-profit & stop-loss',
      '24/7 automated execution',
      'Kill switch protection',
      'Daily/weekly loss limits',
      'Max drawdown protection',
      'PDT rule compliance',
      'Email support',
    ],
    supportedBrokers: ['Choose 1: Alpaca, Tradier, IBKR, Coinbase, Binance, Kraken, or more'],
    cta: 'Get Pro',
    icon: Zap,
    popular: true,
    gradient: 'from-primary to-primary/50',
  },
  {
    name: 'Unlimited',
    description: 'Maximum power, all brokers & exchanges',
    priceUsd: 99,
    period: '/month',
    features: [
      'Everything in Pro, plus:',
      'Unlimited broker/exchange connections',
      'Multi-asset portfolio trading',
      'Priority AI processing',
      'Advanced AI learning engine',
      'Moonshot Scanner access',
      'Position rotation strategy',
      'Advanced capital allocation',
      'Strategy performance tracking',
      'Priority support',
      'Early access to new features',
    ],
    supportedBrokers: ['Alpaca', 'Tradier', 'IBKR'],
    supportedExchanges: ['Coinbase', 'Binance', 'Kraken', 'KuCoin', 'Bybit', 'OKX', 'Gate.io', 'Bitget'],
    cta: 'Go Unlimited',
    icon: Crown,
    popular: false,
    gradient: 'from-amber-500 to-amber-500/50',
  },
];

// Feature comparison row component
const FeatureRow = ({ 
  feature, 
  free, 
  pro, 
  unlimited 
}: { 
  feature: string; 
  free: boolean | string; 
  pro: boolean | string; 
  unlimited: boolean | string;
}) => {
  const renderValue = (value: boolean | string) => {
    if (value === true) {
      return <Check className="w-5 h-5 text-profit mx-auto" />;
    }
    if (value === false) {
      return <Minus className="w-5 h-5 text-muted-foreground mx-auto" />;
    }
    return <span className="text-sm text-muted-foreground">{value}</span>;
  };

  return (
    <tr className="border-b border-border/50 hover:bg-muted/20 transition-colors">
      <td className="py-3 px-6 text-sm text-foreground">{feature}</td>
      <td className="py-3 px-4 text-center">{renderValue(free)}</td>
      <td className="py-3 px-4 text-center bg-primary/5">{renderValue(pro)}</td>
      <td className="py-3 px-4 text-center">{renderValue(unlimited)}</td>
    </tr>
  );
};

// Popular currencies to show in dropdown
const POPULAR_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'BRL', 'MXN', 'SGD'];

export default function Pricing() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { currency, formatPrice, changeCurrency, isLoading: currencyLoading } = useCurrency();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const handleSelectPlan = (tierName: string) => {
    if (!isAuthenticated) {
      navigate('/auth');
    } else {
      navigate('/settings');
    }
  };

  // Admin gets all features free
  if (isAuthenticated && isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b border-border">
          <div className="container mx-auto px-4 py-4 flex items-center justify-between">
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20">
                <Brain className="w-6 h-6 text-primary" />
              </div>
              <span className="text-xl font-bold text-foreground">
                Titan<span className="text-primary">AI</span>
              </span>
            </Link>
            <Button variant="outline" asChild>
              <Link to="/dashboard">Dashboard</Link>
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
            <Link to="/dashboard">Go to Dashboard</Link>
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
          <Link to={isAuthenticated ? '/dashboard' : '/'} className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">
              Titan<span className="text-primary">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {/* Currency Selector */}
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
            const basePrice = billingPeriod === 'yearly' && tier.priceUsd > 0 
              ? Math.round(tier.priceUsd * 0.8) 
              : tier.priceUsd;
            
            const displayPrice = tier.priceUsd === 0 
              ? (currency.code === 'USD' ? '$0' : formatPrice(0))
              : formatPrice(basePrice);
            
            const yearlyTotal = billingPeriod === 'yearly' && tier.priceUsd > 0
              ? formatPrice(basePrice * 12)
              : null;
            
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
                  <span className={cn(
                    "font-bold text-foreground",
                    currencyLoading ? 'animate-pulse' : '',
                    displayPrice.length > 8 ? 'text-2xl' : 'text-4xl'
                  )}>
                    {displayPrice}
                  </span>
                  <span className="text-muted-foreground">
                    {tier.priceUsd === 0 ? tier.period : billingPeriod === 'yearly' ? '/month' : tier.period}
                  </span>
                </div>

                {yearlyTotal && (
                  <p className="text-sm text-profit mb-4">
                    Billed {yearlyTotal}/year
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

                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="w-5 h-5 text-profit shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>

                {/* Limitations for Free tier */}
                {'limitations' in tier && tier.limitations && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Limitations</p>
                    <ul className="space-y-2">
                      {tier.limitations.map((limitation: string) => (
                        <li key={limitation} className="flex items-start gap-3">
                          <X className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                          <span className="text-sm text-muted-foreground">{limitation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Supported Brokers for paid tiers */}
                {'supportedBrokers' in tier && tier.supportedBrokers && (
                  <div className="pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Stock Brokers</p>
                    <div className="flex flex-wrap gap-2">
                      {tier.supportedBrokers.map((broker: string) => (
                        <span 
                          key={broker} 
                          className="px-2 py-1 text-xs bg-primary/10 rounded-md text-primary"
                        >
                          {broker}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Supported Exchanges for paid tiers */}
                {'supportedExchanges' in tier && tier.supportedExchanges && (
                  <div className="pt-4 border-t border-border mt-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Crypto Exchanges</p>
                    <div className="flex flex-wrap gap-2">
                      {tier.supportedExchanges.map((exchange: string) => (
                        <span 
                          key={exchange} 
                          className="px-2 py-1 text-xs bg-warning/10 rounded-md text-warning"
                        >
                          {exchange}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Feature Comparison Table */}
        <div className="mt-20 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center mb-4">
            Compare All Features
          </h2>
          <p className="text-muted-foreground text-center mb-10">
            A detailed side-by-side comparison of what each plan offers
          </p>
          
          <div className="glass-panel rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-4 px-6 font-semibold text-foreground">Feature</th>
                    <th className="text-center py-4 px-4 font-semibold text-foreground">
                      <div className="flex flex-col items-center gap-1">
                        <Sparkles className="w-5 h-5 text-muted-foreground" />
                        <span>Free</span>
                      </div>
                    </th>
                    <th className="text-center py-4 px-4 font-semibold text-primary">
                      <div className="flex flex-col items-center gap-1">
                        <Zap className="w-5 h-5 text-primary" />
                        <span>Pro</span>
                      </div>
                    </th>
                    <th className="text-center py-4 px-4 font-semibold text-amber-500">
                      <div className="flex flex-col items-center gap-1">
                        <Crown className="w-5 h-5 text-amber-500" />
                        <span>Unlimited</span>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Trading Basics */}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-3 px-6 font-semibold text-foreground text-sm uppercase tracking-wide">
                      Trading Basics
                    </td>
                  </tr>
                  <FeatureRow feature="Paper Trading" free pro unlimited />
                  <FeatureRow feature="Virtual Balance" free="$100k" pro="$100k" unlimited="$100k" />
                  <FeatureRow feature="Live Trading" free={false} pro unlimited />
                  <FeatureRow feature="Stock Trading" free="Paper only" pro unlimited />
                  <FeatureRow feature="Crypto Trading" free="Paper only" pro unlimited />
                  
                  {/* Broker & Exchange Connections */}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-3 px-6 font-semibold text-foreground text-sm uppercase tracking-wide">
                      Broker & Exchange Connections
                    </td>
                  </tr>
                  <FeatureRow feature="Stock Brokers (Alpaca, Tradier, IBKR)" free={false} pro="1 broker" unlimited="Unlimited" />
                  <FeatureRow feature="Crypto Exchanges (Coinbase, Binance, etc.)" free={false} pro="1 exchange" unlimited="All 8 exchanges" />
                  <FeatureRow feature="Multi-Exchange Trading" free={false} pro={false} unlimited />
                  
                  {/* AI Features */}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-3 px-6 font-semibold text-foreground text-sm uppercase tracking-wide">
                      AI Features
                    </td>
                  </tr>
                  <FeatureRow feature="AI Market Regime Detection" free pro unlimited />
                  <FeatureRow feature="AI Strategy Advisor" free pro unlimited />
                  <FeatureRow feature="Autonomous AI Trader" free={false} pro unlimited />
                  <FeatureRow feature="User-Confirmed Trade Mode" free={false} pro unlimited />
                  <FeatureRow feature="AI Learning Engine" free="Basic" pro="Standard" unlimited="Advanced" />
                  <FeatureRow feature="Priority AI Processing" free={false} pro={false} unlimited />
                  
                  {/* Trading Strategies */}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-3 px-6 font-semibold text-foreground text-sm uppercase tracking-wide">
                      Trading Strategies
                    </td>
                  </tr>
                  <FeatureRow feature="All 8 Trading Strategies" free pro unlimited />
                  <FeatureRow feature="Strategy Performance Tracking" free="Basic" pro="Standard" unlimited="Advanced" />
                  <FeatureRow feature="Position Rotation Strategy" free={false} pro={false} unlimited />
                  <FeatureRow feature="Advanced Capital Allocation" free={false} pro={false} unlimited />
                  
                  {/* Risk Management */}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-3 px-6 font-semibold text-foreground text-sm uppercase tracking-wide">
                      Risk Management
                    </td>
                  </tr>
                  <FeatureRow feature="Risk Management Dashboard" free pro unlimited />
                  <FeatureRow feature="Auto Take-Profit & Stop-Loss" free={false} pro unlimited />
                  <FeatureRow feature="Daily/Weekly Loss Limits" free={false} pro unlimited />
                  <FeatureRow feature="Max Drawdown Protection" free={false} pro unlimited />
                  <FeatureRow feature="Kill Switch Protection" free={false} pro unlimited />
                  <FeatureRow feature="PDT Rule Compliance" free={false} pro unlimited />
                  
                  {/* Advanced Features */}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-3 px-6 font-semibold text-foreground text-sm uppercase tracking-wide">
                      Advanced Features
                    </td>
                  </tr>
                  <FeatureRow feature="Moonshot Scanner" free={false} pro={false} unlimited />
                  <FeatureRow feature="24/7 Automated Execution" free={false} pro unlimited />
                  <FeatureRow feature="Real-Time Price Data" free pro unlimited />
                  <FeatureRow feature="Performance Analytics" free pro unlimited />
                  <FeatureRow feature="Equity Curve Visualization" free pro unlimited />
                  
                  {/* Support */}
                  <tr className="bg-muted/30">
                    <td colSpan={4} className="py-3 px-6 font-semibold text-foreground text-sm uppercase tracking-wide">
                      Support & Extras
                    </td>
                  </tr>
                  <FeatureRow feature="Support" free="Community" pro="Email" unlimited="Priority" />
                  <FeatureRow feature="Early Access to Features" free={false} pro={false} unlimited />
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="mt-20 max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-foreground text-center mb-10">
            Why Choose TitanAI?
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-primary/20 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-7 h-7 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Multi-Asset Trading</h3>
              <p className="text-sm text-muted-foreground">
                Trade stocks via Alpaca, Tradier, IBKR and crypto on 8+ major exchanges.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-profit/20 flex items-center justify-center mx-auto mb-4">
                <Bot className="w-7 h-7 text-profit" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Autonomous AI Trader</h3>
              <p className="text-sm text-muted-foreground">
                Fully autonomous 24/7 trading or user-confirmed mode for manual control.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-warning/20 flex items-center justify-center mx-auto mb-4">
                <Shield className="w-7 h-7 text-warning" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Risk-First Design</h3>
              <p className="text-sm text-muted-foreground">
                Kill switch, daily/weekly loss limits, max drawdown protection, and PDT compliance.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <Cpu className="w-7 h-7 text-amber-500" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">AI Learning Engine</h3>
              <p className="text-sm text-muted-foreground">
                Continuously learns which strategies perform best in each market regime.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-destructive/20 flex items-center justify-center mx-auto mb-4">
                <Rocket className="w-7 h-7 text-destructive" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">Moonshot Scanner</h3>
              <p className="text-sm text-muted-foreground">
                Detect early signals of cryptocurrencies likely to experience significant gains.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                <LineChart className="w-7 h-7 text-foreground" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">8 Trading Strategies</h3>
              <p className="text-sm text-muted-foreground">
                RSI, EMA Crossover, MACD, Trend Breakout, Grid Bot, DCA, and more.
              </p>
            </div>
          </div>
        </div>

        {/* Currency Note */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>
            Prices shown in {currency.code}. All payments processed in USD.
          </p>
        </div>

        {/* FAQ or Trust Section */}
        <div className="mt-8 text-center">
          <p className="text-muted-foreground">
            Questions? <Link to="/auth" className="text-primary hover:underline">Contact us</Link> or start with the free plan—no credit card required.
          </p>
        </div>
      </main>
    </div>
  );
}

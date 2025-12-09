import { Link } from 'react-router-dom';
import { Brain, Zap, Shield, TrendingUp, Bot, BarChart3, Clock, Target, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: Bot,
    title: 'Autonomous AI Trading',
    description: 'Our AI analyzes market conditions 24/7 and executes trades automatically based on proven strategies.',
  },
  {
    icon: TrendingUp,
    title: 'Market Regime Detection',
    description: 'Automatically detects trending, ranging, and volatile markets to select the optimal strategy.',
  },
  {
    icon: Shield,
    title: 'Risk Management',
    description: 'Built-in safety controls including stop-loss, position limits, and daily loss caps protect your capital.',
  },
  {
    icon: BarChart3,
    title: 'Strategy Learning Engine',
    description: 'The AI continuously learns which strategies perform best in different market conditions.',
  },
  {
    icon: Clock,
    title: '24/7 Automated Execution',
    description: 'Never miss a trade. The bot runs continuously, executing trades even while you sleep.',
  },
  {
    icon: Target,
    title: 'Auto Take-Profit',
    description: 'Automatically captures profits at optimal levels with intelligent exit strategies.',
  },
];

const howItWorks = [
  {
    step: '1',
    title: 'Start with Paper Trading',
    description: 'Practice with $100k virtual balance. Test strategies risk-free and see how the AI performs.',
  },
  {
    step: '2',
    title: 'Connect Your Exchange',
    description: 'Link your Coinbase, Binance, or other supported exchange using API keys. Your funds stay in your account.',
  },
  {
    step: '3',
    title: 'Set Your Risk Limits',
    description: 'Define your maximum position size, daily loss limit, and allowed markets. The AI respects these as hard limits.',
  },
  {
    step: '4',
    title: 'Enable Autonomous Mode',
    description: 'Turn on the AI trader and let it analyze markets, select strategies, and execute trades 24/7.',
  },
  {
    step: '5',
    title: 'Monitor & Withdraw Profits',
    description: 'Track performance on your dashboard. The milestone system automatically helps you realize profits.',
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/20">
              <Brain className="w-6 h-6 text-primary" />
            </div>
            <span className="text-xl font-bold text-foreground">
              Titan<span className="text-primary">AI</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link to="/pricing">Pricing</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button variant="glow" asChild>
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            AI-Powered Crypto Trading
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 leading-tight">
            Autonomous Trading
            <br />
            <span className="text-primary">Powered by AI</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Let our AI analyze markets, select strategies, and execute trades 24/7. 
            Start with paper trading, then go live when you're ready.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button variant="glow" size="lg" className="gap-2 text-lg px-8" asChild>
              <Link to="/auth">
                Start Free Paper Trading
                <ArrowRight className="w-5 h-5" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="gap-2 text-lg px-8" asChild>
              <Link to="/pricing">View Pricing</Link>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            No credit card required • $100k virtual balance included
          </p>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything You Need to Trade Smarter
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Titan AI combines advanced machine learning with proven trading strategies
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="glass-panel p-6 rounded-2xl border border-border hover:border-primary/50 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Get started in minutes with our simple 5-step process
            </p>
          </div>
          <div className="max-w-4xl mx-auto space-y-6">
            {howItWorks.map((item, index) => (
              <div
                key={item.step}
                className="flex gap-6 items-start glass-panel p-6 rounded-2xl border border-border"
              >
                <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg shrink-0">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported Exchanges */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            8 Exchanges Supported
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Connect your favorite crypto exchange and start trading
          </p>
          <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
            {['Coinbase', 'Binance', 'Kraken', 'KuCoin', 'Bybit', 'OKX', 'Gate.io', 'Bitget'].map((exchange) => (
              <div
                key={exchange}
                className="px-6 py-3 rounded-xl bg-background border border-border text-foreground font-medium"
              >
                {exchange}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Risk Disclaimer */}
      <section className="py-12 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="glass-panel p-6 rounded-2xl border border-border max-w-4xl mx-auto">
            <div className="flex items-start gap-4">
              <Shield className="w-8 h-8 text-muted-foreground shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Important Risk Disclosure
                </h3>
                <p className="text-sm text-muted-foreground">
                  Cryptocurrency trading involves substantial risk of loss. Titan AI is a trading tool that attempts to maximize 
                  profits within your defined risk limits, but does not guarantee profits. Past performance is not indicative of 
                  future results. Only trade with funds you can afford to lose. You maintain full custody of your funds at all times.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Ready to Start Trading?
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Join Titan AI today. Start with free paper trading and upgrade when you're ready for live trading.
          </p>
          <Button variant="glow" size="lg" className="gap-2 text-lg px-8" asChild>
            <Link to="/auth">
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-primary/20">
              <Brain className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-foreground">
              Titan<span className="text-primary">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link to="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            © 2024 Titan AI. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

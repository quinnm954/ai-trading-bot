import { Link } from 'react-router-dom';
import { Brain, Zap, Shield, ArrowRight, Users, Lock, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      <section className="py-24 md:py-36 relative overflow-hidden">
        {/* Background gradient effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/10 rounded-full blur-3xl pointer-events-none opacity-30" />
        
        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
            <Zap className="w-4 h-4" />
            AI-Powered Stock & Crypto Trading
          </div>
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 leading-tight">
            Autonomous Trading
            <br />
            <span className="text-primary">Powered by AI</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 leading-relaxed">
            Stop watching charts. Let our AI trade for you 24/7 while you focus on what matters most.
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
          <p className="text-sm text-muted-foreground mt-6">
            No credit card required • $100k virtual balance included
          </p>
        </div>
      </section>

      {/* Emotional Hook - Pain Points */}
      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
              Tired of missing opportunities while you sleep?
            </h2>
            <div className="grid md:grid-cols-3 gap-8 text-left">
              <div className="p-6 rounded-2xl bg-muted/30 border border-border">
                <Clock className="w-8 h-8 text-primary mb-4" />
                <p className="text-foreground font-medium mb-2">Markets never sleep</p>
                <p className="text-sm text-muted-foreground">
                  Crypto trades 24/7. Stocks have pre-market and after-hours. You can't watch everything.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-muted/30 border border-border">
                <TrendingUp className="w-8 h-8 text-primary mb-4" />
                <p className="text-foreground font-medium mb-2">Emotions kill profits</p>
                <p className="text-sm text-muted-foreground">
                  Fear and greed lead to bad decisions. AI trades based on data, not feelings.
                </p>
              </div>
              <div className="p-6 rounded-2xl bg-muted/30 border border-border">
                <Shield className="w-8 h-8 text-primary mb-4" />
                <p className="text-foreground font-medium mb-2">Risk is hard to manage</p>
                <p className="text-sm text-muted-foreground">
                  One bad trade can wipe out months of gains. Automated limits protect your capital.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-16 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-12">
              Built for traders who value their time and money
            </h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Trust Signal Cards */}
              <div className="flex items-start gap-4 p-6 rounded-2xl bg-background border border-border">
                <div className="w-12 h-12 rounded-full bg-profit/20 flex items-center justify-center shrink-0">
                  <Lock className="w-6 h-6 text-profit" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Your Funds, Your Control</h3>
                  <p className="text-sm text-muted-foreground">
                    We never hold your money. Connect your own broker or exchange account. Withdraw anytime.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 p-6 rounded-2xl bg-background border border-border">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Kill Switch Protection</h3>
                  <p className="text-sm text-muted-foreground">
                    Automatic trading pause if losses exceed your limits. Capital preservation comes first.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 p-6 rounded-2xl bg-background border border-border">
                <div className="w-12 h-12 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">Paper Trade First</h3>
                  <p className="text-sm text-muted-foreground">
                    Test with $100k virtual balance before risking real money. See exactly how the AI performs.
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4 p-6 rounded-2xl bg-background border border-border">
                <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Brain className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">AI That Learns</h3>
                  <p className="text-sm text-muted-foreground">
                    Continuously adapts to market conditions. Automatically picks the best strategy for the moment.
                  </p>
                </div>
              </div>
            </div>
            
            {/* Supported Platforms */}
            <div className="mt-12 text-center">
              <p className="text-sm text-muted-foreground mb-4">Supports stocks and crypto across 11+ brokers & exchanges</p>
              <div className="flex flex-wrap justify-center gap-3">
                {['Alpaca', 'Tradier', 'IBKR', 'Coinbase', 'Binance', 'Kraken', 'KuCoin', 'Bybit'].map((name) => (
                  <span
                    key={name}
                    className="px-4 py-2 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground"
                  >
                    {name}
                  </span>
                ))}
                <span className="px-4 py-2 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
                  +3 more
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Risk Disclaimer */}
      <section className="py-10 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto flex items-start gap-4 p-5 rounded-xl bg-muted/30 border border-border">
            <Shield className="w-6 h-6 text-muted-foreground shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Risk Disclosure:</span> Trading involves substantial risk of loss. 
              Titan AI does not guarantee profits. Only trade with funds you can afford to lose.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Start trading smarter today
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Free paper trading. No credit card. See results before you commit.
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
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="px-2 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
              Patent Pending
            </span>
            <p>© 2024 Titan AI. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

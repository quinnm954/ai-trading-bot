import { useState } from 'react';
import { Crown, Zap, Shield, Brain, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CashAppPaymentDialog } from './CashAppPaymentDialog';

const PRO_FEATURES = [
  'Live trading with real money',
  'Connect your broker account',
  'Autonomous AI trading',
  'Advanced risk management',
];

const UNLIMITED_FEATURES = [
  'Everything in Pro, plus:',
  'Unlimited broker connections',
  'Moonshot Scanner access',
  'AI Learning Engine',
  'Priority support',
];

export function TrialExpiredOverlay() {
  const [dialogTier, setDialogTier] = useState<'pro' | 'unlimited' | null>(null);

  const handleUpgrade = (tier: 'pro' | 'unlimited') => {
    setDialogTier(tier);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-4xl w-full space-y-8 animate-in fade-in-0 zoom-in-95 duration-300">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Your 7-Day Free Trial Has Ended
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Upgrade now to continue using TitanAI and unlock powerful trading features
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pro Plan */}
          <Card className="border-2 border-border hover:border-primary/50 transition-colors">
            <CardHeader className="text-center pb-4">
              <div className="mx-auto p-3 rounded-full bg-primary/20 w-fit mb-2">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">Pro</CardTitle>
              <CardDescription>For active traders</CardDescription>
              <div className="pt-2">
                <span className="text-4xl font-bold text-foreground">$49</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                onClick={() => handleUpgrade('pro')}
              >
                <Zap className="w-4 h-4 mr-2" />
                Pay with Cash App
              </Button>
            </CardContent>
          </Card>

          {/* Unlimited Plan */}
          <Card className="border-2 border-primary bg-gradient-to-br from-primary/5 to-transparent relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-bl-lg">
              BEST VALUE
            </div>
            <CardHeader className="text-center pb-4">
              <div className="mx-auto p-3 rounded-full bg-primary/20 w-fit mb-2">
                <Crown className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl">Unlimited</CardTitle>
              <CardDescription>For serious traders</CardDescription>
              <div className="pt-2">
                <span className="text-4xl font-bold text-foreground">$99</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {UNLIMITED_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant="glow"
                size="lg"
                className="w-full"
                onClick={() => handleUpgrade('unlimited')}
              >
                <Crown className="w-4 h-4 mr-2" />
                Pay with Cash App
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          <Brain className="w-4 h-4 inline mr-1" />
          Join thousands of traders using AI-powered automation
        </p>
      </div>

      {dialogTier && (
        <CashAppPaymentDialog
          open={dialogTier !== null}
          onOpenChange={(o) => !o && setDialogTier(null)}
          tier={dialogTier}
        />
      )}
    </div>
  );
}

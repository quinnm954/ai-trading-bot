import { Shield, Check, Brain } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WalletCheckoutButton } from './WalletCheckoutButton';
import { MONTHLY_PRICE_USD, PLAN_NAME, PLAN_FEATURES } from '@/lib/pricing';

export function TrialExpiredOverlay() {
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="max-w-lg w-full space-y-6 animate-in fade-in-0 zoom-in-95 duration-300">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
            <Shield className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">
            Your 7-Day Free Trial Has Ended
          </h1>
          <p className="text-muted-foreground">
            One plan, everything unlocked. Continue trading with TitanAI.
          </p>
        </div>

        <Card className="border-2 border-primary bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-2xl">{PLAN_NAME}</CardTitle>
            <CardDescription>Unlimited use — no tiers, no add-ons</CardDescription>
            <div className="pt-2">
              <span className="text-4xl font-bold text-foreground">${MONTHLY_PRICE_USD}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2">
              {PLAN_FEATURES.slice(0, 8).map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-sm">
                  <Check className="w-4 h-4 text-primary shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <WalletCheckoutButton />
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          <Brain className="w-4 h-4 inline mr-1" />
          Join thousands of traders using AI-powered automation
        </p>
      </div>
    </div>
  );
}

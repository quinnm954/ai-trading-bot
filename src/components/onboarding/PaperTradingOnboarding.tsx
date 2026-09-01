import { useState, useEffect } from 'react';
import {
  Rocket,
  TrendingUp,
  Bot,
  Target,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';

const ONBOARDING_KEY = 'titan_onboarding_completed';

interface OnboardingStep {
  icon: typeof Rocket;
  title: string;
  description: string;
}

const steps: OnboardingStep[] = [
  {
    icon: Rocket,
    title: 'Welcome to Titan AI Trading',
    description:
      'You start with $100,000 in virtual funds so you can learn the system risk-free. Nothing here touches real money until you connect a broker and switch to live mode.',
  },
  {
    icon: Bot,
    title: '1. Start the AI trader',
    description:
      'Go to AI Trader and press Start. The bot scans the market every cycle, picks a strategy for current conditions, and opens positions automatically. Press Stop and it stays stopped until you start it again.',
  },
  {
    icon: Target,
    title: '2. Set your risk limits first',
    description:
      'On the Risk page choose a risk profile and set position size, daily loss limit, and max drawdown. Those settings are the single source of truth — the bot cannot exceed them, and the kill switch halts trading if you hit them.',
  },
  {
    icon: TrendingUp,
    title: '3. Watch the dashboard',
    description:
      'The dashboard shows equity, cash, open positions, P&L against your initial deposit, and expectancy per strategy. Every trade, including swaps and rotations, is logged in the Trade Journal.',
  },
  {
    icon: Shield,
    title: '4. Going live is deliberate',
    description:
      'Live mode requires connecting your exchange API keys and a typed confirmation. Live and paper follow identical rules: minimum 1.6:1 reward-to-risk, stops at -0.8%, and fees included. Trade paper until the numbers look right.',
  },
];

export function PaperTradingOnboarding() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    if (localStorage.getItem(ONBOARDING_KEY)) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count: tradesCount } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if ((tradesCount ?? 0) === 0) {
      setIsVisible(true);
    }
  };

  const isLastStep = currentStep === steps.length - 1;

  const handleNext = () => {
    if (!isLastStep) {
      setCurrentStep((s) => s + 1);
      return;
    }
    if (dontShowAgain) localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  const step = steps[currentStep];
  const StepIcon = step.icon;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-lg glass-panel p-0 overflow-hidden shadow-2xl border border-primary/20">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-5 pb-6 sm:p-6 sm:pb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <StepIcon className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-xs font-medium text-primary uppercase tracking-wide">
                  How to use Titan AI
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>
          </div>

          <Progress value={progress} className="h-1" />
        </div>

        {/* Content */}
        <div className="p-5 sm:p-6 space-y-5">
          <div className="space-y-3">
            <h2 className="text-lg sm:text-xl font-bold text-foreground">{step.title}</h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>

          {currentStep === 0 && (
            <div className="p-4 rounded-lg bg-profit/10 border border-profit/30 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-profit/20 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5 text-profit" />
              </div>
              <div>
                <p className="font-bold text-2xl text-profit">$100,000</p>
                <p className="text-xs text-muted-foreground">Virtual trading balance</p>
              </div>
            </div>
          )}

          {isLastStep && (
            <label className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 cursor-pointer">
              <Checkbox
                checked={dontShowAgain}
                onCheckedChange={(c) => setDontShowAgain(c === true)}
                className="mt-0.5"
              />
              <span className="text-sm text-muted-foreground">
                Don't show this tutorial again (you can replay it any time from Settings)
              </span>
            </label>
          )}

          <div className="flex gap-3">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep((s) => s - 1)}
                className="gap-2 min-h-[44px]"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            <Button onClick={handleNext} className="flex-1 gap-2 min-h-[44px]">
              {isLastStep ? 'Start Trading' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

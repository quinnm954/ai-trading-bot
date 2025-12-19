import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Rocket, 
  TrendingUp, 
  Bot, 
  Target, 
  ChevronRight, 
  X,
  Sparkles,
  PlayCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';

const ONBOARDING_KEY = 'titan_onboarding_completed';

interface OnboardingStep {
  icon: typeof Rocket;
  title: string;
  description: string;
  action?: { label: string; path: string };
}

const steps: OnboardingStep[] = [
  {
    icon: Rocket,
    title: 'Welcome to Titan AI Trading!',
    description: 'You have $100,000 in virtual funds to practice trading risk-free. Let\'s get you started on your journey to trading mastery.',
  },
  {
    icon: Bot,
    title: 'Meet Your AI Trading Assistant',
    description: 'Our AI analyzes market conditions and can execute trades automatically. Start with paper trading to see how it works.',
    action: { label: 'Enable AI Trader', path: '/ai-trader' },
  },
  {
    icon: TrendingUp,
    title: 'Explore Trading Strategies',
    description: 'View proven strategies like RSI, EMA Crossover, and MACD. The AI will learn which work best for current market conditions.',
    action: { label: 'View Strategies', path: '/strategies' },
  },
  {
    icon: Target,
    title: 'Set Your Risk Limits',
    description: 'Configure position sizes, daily loss limits, and max drawdown to protect your capital — even in paper trading mode.',
    action: { label: 'Configure Risk', path: '/risk' },
  },
];

export function PaperTradingOnboarding() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isNewUser, setIsNewUser] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    // Check localStorage first
    if (localStorage.getItem(ONBOARDING_KEY)) {
      return;
    }

    // Check if user has any trading activity
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { count: tradesCount } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    // Show onboarding if no trades yet
    if (tradesCount === 0) {
      setIsNewUser(true);
      setIsVisible(true);
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const completeOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsVisible(false);
  };

  const handleAction = (path: string) => {
    completeOnboarding();
    navigate(path);
  };

  if (!isVisible || !isNewUser) return null;

  const step = steps[currentStep];
  const StepIcon = step.icon;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="w-full max-w-lg glass-panel p-0 overflow-hidden shadow-2xl border border-primary/20">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-6 pb-8">
          <button 
            onClick={handleSkip}
            className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
              <StepIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary animate-pulse" />
                <span className="text-xs font-medium text-primary uppercase tracking-wide">
                  Getting Started
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
        <div className="p-6 space-y-6">
          <div className="space-y-3">
            <h2 className="text-xl font-bold text-foreground">
              {step.title}
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>

          {/* Virtual Balance Highlight (first step only) */}
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

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            {step.action && (
              <Button 
                onClick={() => handleAction(step.action!.path)}
                className="flex-1 gap-2"
              >
                <PlayCircle className="w-4 h-4" />
                {step.action.label}
              </Button>
            )}
            <Button 
              variant={step.action ? "outline" : "default"}
              onClick={handleNext}
              className="flex-1 gap-2"
            >
              {currentStep === steps.length - 1 ? 'Start Trading' : 'Next'}
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          {/* Skip link */}
          <button 
            onClick={handleSkip}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip tutorial
          </button>
        </div>
      </div>
    </div>
  );
}

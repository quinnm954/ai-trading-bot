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
  Users,
  Brain,
  History,
  Wallet,
  Zap,
  Key,
  BarChart3,
  GraduationCap,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';

const ONBOARDING_KEY = 'titan_onboarding_completed';

interface OnboardingStep {
  icon: typeof Rocket;
  chapter: string;
  title: string;
  description: string;
  points?: string[];
  where?: string;
}

const steps: OnboardingStep[] = [
  {
    icon: Rocket,
    chapter: 'Welcome',
    title: 'What TitanAI actually is',
    description:
      'TitanAI is an autonomous crypto trading system. A team of AI agents watches the market, scores opportunities, checks them against your risk limits, and executes — you set the rules and supervise.',
    points: [
      'You start in Paper mode with $100,000 in virtual funds. Nothing is real until you connect an exchange and switch to Live.',
      'TitanAI never holds your money. Live trading runs through your own exchange API keys; subscription payments go wallet-to-wallet.',
      'Paper and Live follow identical rules, so paper results are a fair preview of live behaviour.',
    ],
  },
  {
    icon: Users,
    chapter: 'The system',
    title: 'Five agents, one trading desk',
    description:
      'Instead of one black-box bot, five specialists talk to each other every cycle (every 30 minutes) and you can read every message they send.',
    points: [
      'Watcher — pulls live prices and classifies the market regime: trending, ranging, volatile, or dead.',
      'Analyst — scores candidates, audits closed trades, and reports what is actually working.',
      'Risk — the gatekeeper. Every trade must pass your limits before it can exist.',
      'Trader — sizes and places the orders the Risk agent approved.',
      'Healer — watches for app and data errors, applies known remedies, and learns which fixes work.',
    ],
    where: 'Agents',
  },
  {
    icon: Target,
    chapter: 'Setup step 1',
    title: 'Set your risk limits before anything else',
    description:
      'The Risk page is the single source of truth. The agents physically cannot exceed what you set here — this is your seatbelt, so configure it first.',
    points: [
      'Risk tolerance profile — one choice that tunes position sizing, trade slots, and aggression.',
      'Max position size and max capital usage — caps how much of your balance can be exposed at once.',
      'Daily loss limit and max drawdown — when either is hit, the kill switch halts trading immediately.',
      'Reinvest profits (off by default) — sizing uses your initial deposit only; profits are held as cash.',
    ],
    where: 'Risk',
  },
  {
    icon: Bot,
    chapter: 'Setup step 2',
    title: 'Start the Scalper',
    description:
      'The Scalper page is the on/off switch and cockpit for live decision-making. Press Start and the cycle begins; press Stop and it stays stopped until you start it again — nothing auto-restarts it.',
    points: [
      'Execution mode: Autonomous (agents trade for you) or User-confirmed (trades queue for your approval first).',
      'Meme-coins-only toggle restricts the universe to the low-priced meme allowlist.',
      'Bot status shows Idle, Learning, or Trading, plus why it stood down when it did.',
    ],
    where: 'Scalper',
  },
  {
    icon: Shield,
    chapter: 'The rules',
    title: 'How a trade is actually allowed',
    description:
      'Every candidate runs a fixed gauntlet. If any check fails, no trade happens — standing aside is a valid outcome.',
    points: [
      'Reward-to-risk must be at least 1.6:1, with take-profit ≥1.4% and stop ≤0.8%.',
      'Fees (~0.8% round trip) are subtracted before a setup counts as profitable.',
      'Stops fire at exactly -0.8%; if a fill slips past it, a red alert appears on your dashboard.',
      'Duplicate symbols, recent losers on cooldown, parabolic pumps, and crashes are all skipped.',
    ],
  },
  {
    icon: TrendingUp,
    chapter: 'Reading results',
    title: 'The dashboard, line by line',
    description:
      'The dashboard answers one question: is this working? Every number is live and traceable to a trade.',
    points: [
      'Equity = cash + open position value. Cash and positions are broken out separately.',
      'P&L is measured against your initial deposit, not a moving basis, so it cannot flatter itself.',
      'Expectancy per strategy is the truth metric — average dollars won per trade after fees. Negative expectancy strategies get their size cut in half.',
      'Milestone progress tracks how far you are toward your next withdrawal target.',
    ],
    where: 'Dashboard',
  },
  {
    icon: History,
    chapter: 'Reading results',
    title: 'Trade history and the journal',
    description:
      'Every fill is logged and scoped to the mode you are viewing, so paper and live never mix into one misleading number.',
    points: [
      'Each entry records entry/exit price, stop and target, strategy, fees, R:R, duration, and the exit reason.',
      'Swaps and rotations are logged as both legs, so nothing disappears between positions.',
      'The AI reasoning for each entry is saved — you can review why a trade was taken, not just what happened.',
    ],
    where: 'Trade History',
  },
  {
    icon: Brain,
    chapter: 'Research tools',
    title: 'Fusion, Signals, and Market Depth',
    description:
      'These pages are where conviction comes from. They inform the agents and let you sanity-check their decisions.',
    points: [
      'Titan Fusion — a conviction score per symbol that gates and re-ranks trading decisions each cycle.',
      'Signals — whale flows, social sentiment, MEV activity, and top-trader positioning.',
      'Market Depth — live Level 2 order book. Read-only by design: manual orders would bypass your risk checks.',
      'Moonshot Scanner — pump-probability scoring for early low-cap candidates.',
    ],
    where: 'Fusion / Signals / Market Depth',
  },
  {
    icon: BarChart3,
    chapter: 'Research tools',
    title: 'Backtesting and the learning engine',
    description:
      'Test before you trust. The system also tunes itself from its own paper results.',
    points: [
      'Backtesting replays a strategy over historical data and reports return, win rate, drawdown, and profit factor.',
      'The learning engine adjusts strategy parameters based on realised performance per market regime.',
      'Strategy Control lets you enable or disable individual strategies outright.',
    ],
    where: 'Backtesting',
  },
  {
    icon: Zap,
    chapter: 'Advanced',
    title: 'Leverage — optional and gated',
    description:
      'Leverage multiplies losses as fast as gains, so it is off by default and capped separately from spot trading.',
    points: [
      'Paper leverage is available for practice; live leverage requires explicit confirmation.',
      'The liquidation map shows where crowded positions sit, and each position gets a liquidation-distance estimate.',
      'Leverage scales down automatically in volatile regimes.',
    ],
    where: 'Leverage',
  },
  {
    icon: Key,
    chapter: 'Going live',
    title: 'Connecting a real exchange',
    description:
      'Only do this once your paper expectancy is positive and you understand every number on the dashboard.',
    points: [
      'Add your Coinbase API keys on the API Keys page; they are encrypted and only used to trade your own account.',
      'Switching to Live mode requires a typed confirmation — there is no accidental path to real money.',
      'Set your live investment basis in Settings so P&L measures against what you actually deposited.',
      'Balances sync from the exchange; disconnecting a broker zeroes its balance immediately.',
    ],
    where: 'API Keys',
  },
  {
    icon: Wallet,
    chapter: 'Billing',
    title: 'Access and payments',
    description:
      'One plan, $29 for 30 days of Full Access. Paid in USDC directly from your wallet — no card, no payment processor.',
    points: [
      'On the Wallet page you connect your own wallet, see your on-chain USDC balance, and pay in one click.',
      'Payment is verified on-chain and access unlocks automatically, usually within a minute.',
      'Every payment is listed with a link to its blockchain receipt. TitanAI never holds your funds.',
    ],
    where: 'Wallet',
  },
  {
    icon: GraduationCap,
    chapter: 'Your first week',
    title: 'A sensible way to start',
    description:
      'Follow this order and you will learn the system without risking anything.',
    points: [
      '1. Set your risk limits. 2. Start the Scalper in Paper mode. 3. Check back daily.',
      'Judge it on expectancy and drawdown over dozens of trades — not on any single trade.',
      'Use Settings to reset the paper account to a clean $100,000 whenever you change your approach.',
      'Only consider Live once paper expectancy is positive across a real sample. No system guarantees profits.',
    ],
    where: 'Settings',
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-3 backdrop-blur-sm animate-fade-in sm:p-4">
      <div className="glass-panel flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden border border-primary/20 p-0 shadow-2xl">
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-4 pb-5 sm:p-6 sm:pb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/20 sm:h-12 sm:w-12">
              <StepIcon className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-primary animate-pulse" />
                <span className="truncate text-xs font-medium uppercase tracking-wide text-primary">
                  {step.chapter}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Step {currentStep + 1} of {steps.length} · full walkthrough
              </span>
            </div>
          </div>

          <Progress value={progress} className="h-1" />
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          <h2 className="text-lg font-bold text-foreground sm:text-xl">{step.title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            {step.description}
          </p>

          {step.points && (
            <ul className="space-y-2.5">
              {step.points.map((point) => (
                <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-foreground/90">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}

          {step.where && (
            <p className="text-xs text-muted-foreground">
              Find this under <span className="font-medium text-foreground">{step.where}</span> in the
              sidebar.
            </p>
          )}

          {currentStep === 0 && (
            <div className="flex items-center gap-4 rounded-lg border border-profit/30 bg-profit/10 p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-profit/20">
                <TrendingUp className="h-5 w-5 text-profit" />
              </div>
              <div>
                <p className="text-2xl font-bold text-profit">$100,000</p>
                <p className="text-xs text-muted-foreground">Virtual trading balance</p>
              </div>
            </div>
          )}

          {isLastStep && (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-secondary/30 p-3">
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
        </div>

        {/* Footer nav */}
        <div className="shrink-0 border-t border-border/60 p-4 sm:px-6">
          <div className="flex gap-3">
            {currentStep > 0 && (
              <Button
                variant="outline"
                onClick={() => setCurrentStep((s) => s - 1)}
                className="min-h-[44px] gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            <Button onClick={handleNext} className="min-h-[44px] flex-1 gap-2">
              {isLastStep ? 'Start Trading' : 'Next'}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Target, AlertTriangle, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useCapitalPlanner } from '@/hooks/useCapitalPlanner';
import { expectancyPctPerTrade } from '@/lib/exitGeometry';
import { cn } from '@/lib/utils';

const money = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/**
 * Capital planner — presentation only.
 *
 * Answers "what deposit does my daily target need?" using the geometry and caps that are
 * actually in force plus the measured win rate, instead of an optimistic assumption. When
 * expectancy is negative it says so: no deposit size fixes a losing edge.
 */
export function CapitalPlannerCard({ isPaper }: { isPaper: boolean }) {
  const { stats, loading } = useCapitalPlanner(isPaper);
  const [goalInput, setGoalInput] = useState('200');
  const [winRateInput, setWinRateInput] = useState('');

  const goal = Math.max(Number(goalInput) || 0, 0);

  const model = useMemo(() => {
    if (!stats) return null;
    const measuredWr = stats.winRatePct;
    const usedWr = winRateInput.trim() !== '' ? Math.min(Math.max(Number(winRateInput) || 0, 0), 100) : measuredWr;
    const expPct = expectancyPctPerTrade(usedWr, stats.geo);
    const tradesPerDay = stats.tradesPerDay > 0 ? stats.tradesPerDay : 0;

    // Net profit per day = trades/day × expectancy% × notional per position.
    const dailyReturnPctOfCapital = (tradesPerDay * expPct * stats.notionalPctPerSlot) / 100;
    const requiredDeposit =
      dailyReturnPctOfCapital > 0 ? (goal / dailyReturnPctOfCapital) * 100 : null;
    const projectedDaily =
      stats.capitalBasis > 0 ? (stats.capitalBasis * dailyReturnPctOfCapital) / 100 : 0;

    return {
      usedWr,
      measuredWr,
      isOverride: winRateInput.trim() !== '',
      expPct,
      tradesPerDay,
      requiredDeposit,
      projectedDaily,
      projectedMonthly: projectedDaily * 30,
      belowBreakeven: usedWr < stats.geo.breakevenWinRatePct,
      noSample: stats.sampleSize < 10 || tradesPerDay <= 0,
    };
  }, [stats, goal, winRateInput]);

  if (loading || !stats || !model) {
    return (
      <div className="glass-panel p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Capital Planner</h3>
        </div>
        <p className="text-xs text-muted-foreground">Loading live stats…</p>
      </div>
    );
  }

  const { geo } = stats;

  return (
    <TooltipProvider>
      <div className="glass-panel p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Capital Planner</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[16rem] text-xs">
              Uses your live exit geometry (win +{geo.netWinPct.toFixed(2)}% / loss −
              {geo.netLossPct.toFixed(2)}% net of the 0.8% fee round trip), your measured win rate and
              trade frequency, and the position caps from Risk Settings. Nothing here is a guarantee.
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Daily profit goal ($)</span>
            <Input
              inputMode="decimal"
              value={goalInput}
              onChange={e => setGoalInput(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Win rate % (optional)</span>
            <Input
              inputMode="decimal"
              placeholder={model.measuredWr.toFixed(1)}
              value={winRateInput}
              onChange={e => setWinRateInput(e.target.value)}
              className="mt-1 h-9 text-sm"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">Deposit needed</p>
            <p className="text-base font-bold text-foreground break-words">
              {model.requiredDeposit ? money(model.requiredDeposit) : '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              for {money(goal)}/day at {model.usedWr.toFixed(1)}% wins
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">Net expectancy / trade</p>
            <p className={cn('text-base font-bold', model.expPct >= 0 ? 'text-success' : 'text-loss')}>
              {model.expPct >= 0 ? '+' : ''}{model.expPct.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              breakeven at {geo.breakevenWinRatePct.toFixed(1)}% wins
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">Projected on current capital</p>
            <p className={cn('text-base font-bold', model.projectedDaily >= 0 ? 'text-success' : 'text-loss')}>
              {model.projectedDaily >= 0 ? '+' : ''}{money(model.projectedDaily)}/day
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {model.projectedMonthly >= 0 ? '+' : ''}{money(model.projectedMonthly)}/mo on{' '}
              {money(stats.capitalBasis)} basis
            </p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30">
            <p className="text-xs text-muted-foreground mb-1">Throughput</p>
            <p className="text-base font-bold text-foreground">{model.tradesPerDay.toFixed(1)}/day</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.slots} slots · {stats.notionalPctPerSlot.toFixed(1)}% per position ·{' '}
              {stats.sampleSize} closed trades sampled
            </p>
          </div>
        </div>

        {model.noSample && (
          <p className="mt-3 text-xs text-muted-foreground">
            Not enough closed trades yet for a reliable measurement — enter a win rate above to model a
            scenario.
          </p>
        )}

        {model.belowBreakeven && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning-foreground/90">
              Win rate {model.usedWr.toFixed(1)}% is below the {geo.breakevenWinRatePct.toFixed(1)}%
              breakeven for this geometry, so expectancy is negative — no deposit size produces{' '}
              {money(goal)}/day until entry quality improves. The engine throttles size automatically
              while expectancy stays negative.
            </p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

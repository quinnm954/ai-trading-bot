import { Clock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSubscription } from '@/hooks/useSubscription';

export function TrialDaysIndicator() {
  const navigate = useNavigate();
  const { isInTrial, trialDaysRemaining, subscribed, isFreeAccess, isLoading } = useSubscription();

  // Don't show if loading, subscribed, has free access, or not in trial
  if (isLoading || subscribed || isFreeAccess || !isInTrial) {
    return null;
  }

  // Determine color based on days remaining
  const getColorClasses = () => {
    if (trialDaysRemaining <= 1) {
      return {
        bg: 'bg-loss/10 hover:bg-loss/20',
        text: 'text-loss',
        border: 'border-loss/30',
        icon: 'text-loss',
      };
    }
    if (trialDaysRemaining <= 3) {
      return {
        bg: 'bg-warning/10 hover:bg-warning/20',
        text: 'text-warning',
        border: 'border-warning/30',
        icon: 'text-warning',
      };
    }
    return {
      bg: 'bg-profit/10 hover:bg-profit/20',
      text: 'text-profit',
      border: 'border-profit/30',
      icon: 'text-profit',
    };
  };

  const colors = getColorClasses();
  const daysText = trialDaysRemaining === 1 ? 'day' : 'days';

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => navigate('/pricing')}
      className={cn(
        'gap-2 border transition-all',
        colors.bg,
        colors.border,
        colors.text
      )}
    >
      <Clock className={cn('w-4 h-4', colors.icon)} />
      <span className="font-medium">
        {trialDaysRemaining} {daysText} left
      </span>
      <span className="hidden sm:inline text-muted-foreground">in trial</span>
      <Sparkles className="w-3 h-3 ml-1" />
    </Button>
  );
}

import { Clock, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrialBannerProps {
  daysRemaining: number;
  className?: string;
}

export function TrialBanner({ daysRemaining, className }: TrialBannerProps) {
  // Determine urgency level
  const isUrgent = daysRemaining <= 3 && daysRemaining > 1;
  const isCritical = daysRemaining <= 1 && daysRemaining > 0;
  const isExpired = daysRemaining <= 0;

  const Icon = isExpired ? XCircle : (isCritical || isUrgent) ? AlertTriangle : Clock;

  const getMessage = () => {
    if (isExpired) return 'Your free trial has expired';
    if (daysRemaining === 1) return 'Last day of your free trial!';
    return `${daysRemaining} days remaining in your free trial`;
  };

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium transition-colors',
        isExpired && 'bg-destructive text-destructive-foreground',
        isCritical && !isExpired && 'bg-destructive/90 text-destructive-foreground',
        isUrgent && !isCritical && 'bg-orange-500 text-white dark:bg-orange-600',
        !isUrgent && !isCritical && !isExpired && 'bg-primary/90 text-primary-foreground',
        className
      )}
    >
      <Icon className="w-4 h-4" />
      <span>{getMessage()}</span>
      {!isExpired && (
        <span className="text-xs opacity-80">— Upgrade anytime to unlock all features</span>
      )}
    </div>
  );
}

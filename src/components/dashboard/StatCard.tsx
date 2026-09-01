import { cn } from '@/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  change, 
  changeLabel, 
  icon: Icon, 
  trend = 'neutral',
  className 
}: StatCardProps) {
  return (
    <div className={cn('stat-card', className)}>
      <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        {change !== undefined && (
          <div className={cn(
            'flex shrink-0 items-center gap-1 text-xs sm:text-sm font-medium',
            trend === 'up' && 'text-profit',
            trend === 'down' && 'text-loss',
            trend === 'neutral' && 'text-muted-foreground'
          )}>
            {trend === 'up' && <TrendingUp className="w-4 h-4" />}
            {trend === 'down' && <TrendingDown className="w-4 h-4" />}
            {change > 0 ? '+' : ''}{change.toFixed(2)}%
          </div>
        )}
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground mb-1 truncate">{title}</p>
      <p className="text-lg sm:text-2xl font-bold text-foreground truncate tabular-nums">{value}</p>
      {changeLabel && (
        <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">{changeLabel}</p>
      )}
    </div>
  );
}

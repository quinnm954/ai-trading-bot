import { cn } from '@/lib/utils';
import { Radio } from 'lucide-react';

interface RealtimeIndicatorProps {
  isActive: boolean;
  className?: string;
}

export function RealtimeIndicator({ isActive, className }: RealtimeIndicatorProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all duration-300',
        isActive
          ? 'bg-success/20 text-success animate-pulse'
          : 'bg-muted text-muted-foreground',
        className
      )}
    >
      <Radio className={cn('w-3 h-3', isActive && 'animate-pulse')} />
      <span>{isActive ? 'Live Update' : 'Connected'}</span>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, TrendingUp, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getMarketSession, MarketSession } from '@/lib/stockMarketHours';

interface StockMarketIndicatorProps {
  className?: string;
}

export function StockMarketIndicator({ className }: StockMarketIndicatorProps) {
  const [session, setSession] = useState<MarketSession | null>(null);

  useEffect(() => {
    const updateSession = () => {
      setSession(getMarketSession());
    };

    updateSession();
    const interval = setInterval(updateSession, 60000); // Update every minute

    return () => clearInterval(interval);
  }, []);

  if (!session) return null;

  const getSessionIcon = () => {
    switch (session.session) {
      case 'regular':
        return <TrendingUp className="w-4 h-4" />;
      case 'pre-market':
        return <Sun className="w-4 h-4" />;
      case 'after-hours':
        return <Moon className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getSessionStyles = () => {
    switch (session.session) {
      case 'regular':
        return 'bg-success/20 text-success border-success/30';
      case 'pre-market':
        return 'bg-warning/20 text-warning border-warning/30';
      case 'after-hours':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const formatTimeUntil = () => {
    if (session.isOpen && session.closesAt) {
      const diff = session.closesAt.getTime() - Date.now();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return `Closes in ${hours}h ${mins}m`;
    }
    if (!session.isOpen) {
      const diff = session.nextRegularOpen.getTime() - Date.now();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `Opens in ${days}d ${hours % 24}h`;
      }
      return `Opens in ${hours}h ${mins}m`;
    }
    return null;
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium',
        getSessionStyles()
      )}>
        {getSessionIcon()}
        <span>
          {session.session === 'regular' && 'Stock Market Open'}
          {session.session === 'pre-market' && 'Pre-Market'}
          {session.session === 'after-hours' && 'After-Hours'}
          {session.session === 'closed' && 'Stock Market Closed'}
        </span>
      </div>
      
      {formatTimeUntil() && (
        <span className="text-xs text-muted-foreground">
          {formatTimeUntil()}
        </span>
      )}
    </div>
  );
}

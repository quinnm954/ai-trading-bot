import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PDTWarningProps {
  accountEquity: number;
  dayTradesLast5Days?: number;
  className?: string;
}

/**
 * Pattern Day Trader (PDT) Warning Component
 * 
 * The PDT rule applies to margin accounts with less than $25,000 in equity.
 * If you make 4+ day trades within 5 business days, your account may be
 * flagged as a Pattern Day Trader and restricted.
 */
export function PDTWarning({ 
  accountEquity, 
  dayTradesLast5Days = 0,
  className 
}: PDTWarningProps) {
  const PDT_THRESHOLD = 25000;
  const DAY_TRADE_LIMIT = 3; // 4th trade triggers PDT flag
  
  const isUnderPDTThreshold = accountEquity < PDT_THRESHOLD;
  const isApproachingLimit = dayTradesLast5Days >= 2;
  const isAtLimit = dayTradesLast5Days >= DAY_TRADE_LIMIT;
  
  // Only show if account is under PDT threshold
  if (!isUnderPDTThreshold) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-help',
            isAtLimit 
              ? 'bg-loss/20 text-loss border-loss/30'
              : isApproachingLimit
                ? 'bg-warning/20 text-warning border-warning/30'
                : 'bg-muted text-muted-foreground border-border',
            className
          )}>
            {isAtLimit ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Info className="w-4 h-4" />
            )}
            <span>
              PDT: {dayTradesLast5Days}/{DAY_TRADE_LIMIT} day trades
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[300px]">
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Pattern Day Trader (PDT) Rule</p>
            <p>
              Accounts under $25,000 are limited to 3 day trades per 5 business days.
              A day trade is opening and closing the same position within one day.
            </p>
            <div className="pt-2 border-t border-border">
              <p className="text-muted-foreground">
                Your equity: ${accountEquity.toLocaleString()}
                <br />
                Day trades (5 days): {dayTradesLast5Days} / {DAY_TRADE_LIMIT}
              </p>
            </div>
            {accountEquity < PDT_THRESHOLD && (
              <p className="text-warning text-xs">
                Deposit ${(PDT_THRESHOLD - accountEquity).toLocaleString()} more to remove PDT restrictions.
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

import { Info, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PDTWarningProps {
  /** Account equity from the connected stock broker. */
  equity?: number;
  /** Margin accounts are subject to intraday margin monitoring; cash accounts are not. */
  accountType?: 'cash' | 'margin';
}

/**
 * Day-trading guardrail notice for stock accounts.
 *
 * The old $25,000 pattern-day-trader equity minimum was eliminated on 4 June 2026 and
 * replaced with real-time intraday margin monitoring, so this no longer blocks small
 * accounts. What still applies: the $2,000 margin minimum, maintenance margin, and
 * cash-account settlement (no reusing unsettled proceeds).
 */
export function PDTWarning({ equity, accountType = 'cash' }: PDTWarningProps) {
  const belowMarginMinimum = accountType === 'margin' && (equity ?? 0) < 2000;

  if (belowMarginMinimum) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Below the $2,000 margin minimum</AlertTitle>
        <AlertDescription className="text-xs">
          Margin accounts must hold at least $2,000 in equity to day trade. Your broker may
          restrict same-day trades until the balance is topped up. Stock entries are sized to
          stay inside your available intraday buying power.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertTitle>Day-trading rules for stocks</AlertTitle>
      <AlertDescription className="text-xs">
        {accountType === 'margin' ? (
          <>
            Since 4 June 2026 there is no $25,000 minimum to day trade. Instead your broker
            monitors intraday margin in real time, so trades are capped by available intraday
            buying power rather than a trade count.
          </>
        ) : (
          <>
            This is a cash account, so sale proceeds must settle before they are reused. Stock
            entries are limited to settled cash — no margin, no shorting.
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

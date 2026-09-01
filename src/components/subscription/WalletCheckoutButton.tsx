import { Loader2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCheckout } from '@/hooks/useCheckout';
import { MONTHLY_PRICE_USD } from '@/lib/pricing';
import { cn } from '@/lib/utils';

interface Props {
  label?: string;
  variant?: 'glow' | 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  showPrice?: boolean;
}

/**
 * Primary purchase button. Sends the user to hosted checkout where Apple Pay
 * shows on iOS/Safari, Google Pay on Android/Chrome, and card is the fallback.
 */
export function WalletCheckoutButton({
  label,
  variant = 'glow',
  size = 'lg',
  className,
  showPrice = true,
}: Props) {
  const { startCheckout, isStartingCheckout } = useCheckout();

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        variant={variant}
        size={size}
        className="w-full gap-2"
        onClick={startCheckout}
        disabled={isStartingCheckout}
      >
        {isStartingCheckout ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Wallet className="w-4 h-4" />
        )}
        {label || (showPrice ? `Pay $${MONTHLY_PRICE_USD}/month` : 'Get Full Access')}
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        Apple Pay & Google Pay supported · Cancel anytime
      </p>
    </div>
  );
}

import { useState } from 'react';
import { Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CryptoPaymentDialog } from './CryptoPaymentDialog';
import { MONTHLY_PRICE_USD, PAYMENT_TOKEN } from '@/lib/pricing';
import { cn } from '@/lib/utils';

interface Props {
  label?: string;
  variant?: 'glow' | 'default' | 'outline';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
  showPrice?: boolean;
}

/**
 * Primary purchase button. Opens the direct-to-wallet USDC payment dialog —
 * no payment processor, no card details, no middleman.
 */
export function CryptoPayButton({
  label,
  variant = 'glow',
  size = 'lg',
  className,
  showPrice = true,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        variant={variant}
        size={size}
        className="w-full gap-2"
        onClick={() => setOpen(true)}
      >
        <Coins className="h-4 w-4" />
        {label || (showPrice ? `Pay $${MONTHLY_PRICE_USD}/month in ${PAYMENT_TOKEN}` : 'Get Full Access')}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Pay in {PAYMENT_TOKEN} from any wallet · No card, no processor · 30 days per payment
      </p>
      <CryptoPaymentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

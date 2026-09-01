import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Copy, Check, Loader2, ExternalLink, Clock, CheckCircle2, AlertTriangle, RefreshCw,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCryptoCheckout } from '@/hooks/useCryptoCheckout';
import { ConnectWalletPay } from './ConnectWalletPay';
import { useSubscription } from '@/hooks/useSubscription';
import { MONTHLY_PRICE_USD } from '@/lib/pricing';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy — please select and copy manually');
    }
  };

  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code
          className={`flex-1 min-w-0 truncate rounded-lg bg-secondary/50 px-3 py-2 text-sm ${
            mono ? 'font-mono' : ''
          }`}
        >
          {value}
        </code>
        <Button variant="outline" size="icon" onClick={copy} aria-label={`Copy ${label}`}>
          {copied ? <Check className="h-4 w-4 text-profit" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

function useCountdown(expiresAt?: string) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (ms <= 0) {
        setRemaining('expired');
        return;
      }
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      setRemaining(`${mins}:${String(secs).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return remaining;
}

/**
 * Payment flow with no processor in the middle: we show the owner's wallet
 * address and an exact USDC amount. The exact amount is what identifies the
 * payer, so it must be sent to the cent (and beyond).
 */
export function CryptoPaymentDialog({ open, onOpenChange }: Props) {
  const {
    invoice, status, isCreating, isChecking, notConfigured, createInvoice, checkPayment, reset,
  } = useCryptoCheckout();
  const { checkSubscription } = useSubscription();
  const countdown = useCountdown(invoice?.expires_at);

  // Create the invoice as soon as the dialog opens
  useEffect(() => {
    if (open && !invoice && !isCreating && !notConfigured) {
      void createInvoice();
    }
  }, [open, invoice, isCreating, notConfigured, createInvoice]);

  // Refresh access state once the payment lands
  useEffect(() => {
    if (status === 'confirmed') {
      void checkSubscription();
    }
  }, [status, checkSubscription]);

  const handleClose = (next: boolean) => {
    if (!next) {
      // Keep the invoice if payment is still outstanding; clear it once done
      if (status === 'confirmed' || status === 'expired') reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {status === 'confirmed' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-profit" />
                Payment received
              </DialogTitle>
              <DialogDescription>
                Full Access is active for the next 30 days. Everything is unlocked.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              {invoice?.chain === 'base' && (
                <p className="text-sm text-muted-foreground">
                  Your payment of {invoice.amount} USDC was confirmed on {invoice.chain_name}.
                </p>
              )}
              <Button className="w-full" onClick={() => handleClose(false)}>Done</Button>
            </div>
          </>
        ) : notConfigured ? (
          <>
            <DialogHeader>
              <DialogTitle>Payments not set up yet</DialogTitle>
              <DialogDescription>
                The receiving wallet hasn't been configured. If you're the site owner, add your
                USDC wallet address in Settings → Crypto Payments.
              </DialogDescription>
            </DialogHeader>
            <Button variant="outline" className="w-full" onClick={() => handleClose(false)}>
              Close
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pay ${MONTHLY_PRICE_USD} in USDC</DialogTitle>
              <DialogDescription>
                Send the exact amount below from any crypto wallet. Access unlocks automatically
                the moment the transfer confirms — usually under a minute.
              </DialogDescription>
            </DialogHeader>

            {isCreating || !invoice ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Preparing your payment…</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{invoice.token}</Badge>
                  <Badge variant="secondary">{invoice.chain_name} network</Badge>
                  {status === 'expired' ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" /> Expired
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" /> {countdown || '—'} left
                    </Badge>
                  )}
                </div>

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Send <strong>{invoice.token}</strong> on the{' '}
                    <strong>{invoice.chain_name}</strong> network only, and send the{' '}
                    <strong>exact amount</strong> — the amount is how your payment is matched to
                    your account. Funds sent on another network may be unrecoverable.
                  </AlertDescription>
                </Alert>

                <div className="flex justify-center rounded-xl bg-white p-4">
                  <QRCodeSVG value={invoice.payment_uri} size={180} level="M" />
                </div>

                <CopyRow label={`Exact amount (${invoice.token})`} value={invoice.amount} />
                <CopyRow label="Wallet address" value={invoice.wallet_address} />

                {status !== 'expired' && (
                  <ConnectWalletPay invoice={invoice} onSent={() => void checkPayment(false)} />
                )}

                {status === 'expired' ? (
                  <Button className="w-full gap-2" onClick={() => { reset(); void createInvoice(); }}>
                    <RefreshCw className="h-4 w-4" />
                    Start a new payment
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Watching the blockchain for your transfer…
                    </div>
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => void checkPayment(true)}
                      disabled={isChecking}
                    >
                      {isChecking
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : <RefreshCw className="h-4 w-4" />}
                      Check now
                    </Button>
                  </div>
                )}

                <p className="text-center text-xs text-muted-foreground">
                  Don't hold USDC yet? Buy it in Coinbase, Kraken, or any wallet app and withdraw
                  to the {invoice.chain_name} network.{' '}
                  <a
                    href="https://www.coinbase.com/price/usdc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    Learn more <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

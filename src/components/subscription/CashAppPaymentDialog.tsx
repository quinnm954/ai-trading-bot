import { useState } from 'react';
import { Copy, Check, Loader2, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// TODO: Replace this with your actual Cash App $cashtag
export const RECEIVING_CASHTAG = '$YourCashtag';

const TIER_PRICES: Record<'pro' | 'unlimited', number> = {
  pro: 49,
  unlimited: 99,
};

const TIER_LABELS: Record<'pro' | 'unlimited', string> = {
  pro: 'Pro',
  unlimited: 'Unlimited',
};

interface CashAppPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tier: 'pro' | 'unlimited';
  onSubmitted?: () => void;
}

export function CashAppPaymentDialog({
  open,
  onOpenChange,
  tier,
  onSubmitted,
}: CashAppPaymentDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'instructions' | 'confirm'>('instructions');
  const [senderCashtag, setSenderCashtag] = useState('');
  const [transactionNote, setTransactionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  const amount = TIER_PRICES[tier];
  const tierLabel = TIER_LABELS[tier];
  const paymentNote = user?.email ?? '';

  const handleCopyCashtag = async () => {
    await navigator.clipboard.writeText(RECEIVING_CASHTAG);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!user) {
      toast.error('You must be signed in');
      return;
    }
    if (!senderCashtag.trim()) {
      toast.error('Please enter the $cashtag you sent from');
      return;
    }

    setSubmitting(true);
    try {
      const cleanedSender = senderCashtag.trim().startsWith('$')
        ? senderCashtag.trim()
        : `$${senderCashtag.trim()}`;

      const { error } = await supabase.from('payment_claims').insert({
        user_id: user.id,
        tier,
        amount,
        sender_cashtag: cleanedSender,
        transaction_note: transactionNote.trim() || null,
      });

      if (error) throw error;

      toast.success('Payment claim submitted! We\'ll review it shortly.');
      onSubmitted?.();
      onOpenChange(false);
      // Reset form
      setStep('instructions');
      setSenderCashtag('');
      setTransactionNote('');
    } catch (err) {
      console.error('Failed to submit claim:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to submit claim');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (isOpen: boolean) => {
    if (!submitting) {
      onOpenChange(isOpen);
      if (!isOpen) {
        setStep('instructions');
        setSenderCashtag('');
        setTransactionNote('');
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Pay with Cash App
            <Badge variant="secondary">{tierLabel}</Badge>
          </DialogTitle>
          <DialogDescription>
            {step === 'instructions'
              ? `Send $${amount} via Cash App to activate your ${tierLabel} plan for 30 days.`
              : 'Confirm your payment details so we can verify and activate your plan.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'instructions' ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Send to</p>
                <div className="flex items-center justify-between gap-2">
                  <code className="text-lg font-mono font-bold text-foreground">
                    {RECEIVING_CASHTAG}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyCashtag}
                    className="gap-1"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copy
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">Amount</p>
                <p className="text-2xl font-bold text-foreground">${amount}.00</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  Add this note to your payment
                </p>
                <code className="text-sm font-mono text-foreground break-all">
                  {paymentNote}
                </code>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs text-foreground/90 space-y-1">
                <p className="font-medium">After sending payment:</p>
                <p className="text-muted-foreground">
                  Click "I've Sent the Payment" below and submit your details.
                  An admin will verify and activate your plan within 24 hours.
                </p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => setStep('confirm')}>
                I've Sent the Payment
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sender-cashtag">Your Cash App $cashtag</Label>
              <Input
                id="sender-cashtag"
                placeholder="$YourCashtag"
                value={senderCashtag}
                onChange={(e) => setSenderCashtag(e.target.value)}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                The $cashtag you sent the payment from.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction-note">
                Transaction reference (optional)
              </Label>
              <Textarea
                id="transaction-note"
                placeholder="e.g. payment ID, screenshot link, or any reference"
                value={transactionNote}
                onChange={(e) => setTransactionNote(e.target.value)}
                disabled={submitting}
                rows={3}
              />
            </div>

            <div className="rounded-lg bg-secondary/30 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="text-foreground font-medium">{tierLabel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="text-foreground font-medium">${amount}.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="text-foreground font-medium">30 days</span>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setStep('instructions')}
                disabled={submitting}
              >
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit Claim'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

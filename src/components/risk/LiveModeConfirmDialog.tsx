import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useRiskManager } from '@/hooks/useRiskManager';
import { useToast } from '@/hooks/use-toast';

// =============================================================================
// Live Mode Confirmation Dialog
// Requires user to type a specific phrase to confirm understanding of risks
// =============================================================================

interface LiveModeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}

const REQUIRED_PHRASE = 'I understand I can lose money';

export function LiveModeConfirmDialog({ open, onOpenChange, onConfirmed }: LiveModeConfirmDialogProps) {
  const [inputPhrase, setInputPhrase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirmLiveMode } = useRiskManager();
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (inputPhrase !== REQUIRED_PHRASE) {
      setError(`Please type exactly: "${REQUIRED_PHRASE}"`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await confirmLiveMode(inputPhrase);

    setIsSubmitting(false);

    if (result.success) {
      toast({
        title: 'Live Mode Enabled',
        description: 'You can now trade with real money. Be careful!',
      });
      setInputPhrase('');
      onOpenChange(false);
      onConfirmed();
    } else {
      setError(result.error || 'Failed to confirm live mode');
    }
  };

  const handleCancel = () => {
    setInputPhrase('');
    setError(null);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 rounded-full bg-loss/20">
              <AlertTriangle className="w-6 h-6 text-loss" />
            </div>
            <AlertDialogTitle className="text-xl">Enable Live Trading?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-left space-y-4">
            <div className="p-4 rounded-lg bg-loss/10 border border-loss/30">
              <p className="font-semibold text-loss mb-2">⚠️ Real Money at Risk</p>
              <ul className="text-sm text-loss/90 space-y-1 list-disc list-inside">
                <li>You are about to trade with <strong>real money</strong></li>
                <li>Losses are <strong>permanent and irreversible</strong></li>
                <li>AI trading does not guarantee profits</li>
                <li>Only trade money you can afford to lose</li>
              </ul>
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">
                To confirm, please type the following phrase exactly:
              </p>
              <p className="text-sm font-mono font-medium text-foreground bg-secondary/50 p-2 rounded">
                {REQUIRED_PHRASE}
              </p>
            </div>

            <Input
              value={inputPhrase}
              onChange={(e) => {
                setInputPhrase(e.target.value);
                setError(null);
              }}
              placeholder="Type the phrase above..."
              className={error ? 'border-loss' : ''}
            />

            {error && (
              <p className="text-sm text-loss">{error}</p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleConfirm}
            disabled={isSubmitting || inputPhrase !== REQUIRED_PHRASE}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Confirming...
              </>
            ) : (
              'Enable Live Trading'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

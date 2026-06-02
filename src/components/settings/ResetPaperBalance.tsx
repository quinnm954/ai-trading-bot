import { useEffect, useState } from 'react';
import { RefreshCcw, AlertTriangle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function ResetPaperBalance() {
  const [isResetting, setIsResetting] = useState(false);
  const [clearHistory, setClearHistory] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [customBalance, setCustomBalance] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('paper_account')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setCurrentBalance(Number(data.balance));
        setCustomBalance(String(Number(data.balance)));
      }
    })();
  }, []);

  const handleSetCustomBalance = async () => {
    const value = parseFloat(customBalance);
    if (!Number.isFinite(value) || value < 0) {
      toast.error('Enter a valid non-negative number');
      return;
    }
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Not authenticated');
        return;
      }
      const { error } = await supabase
        .from('paper_account')
        .update({ balance: value })
        .eq('user_id', user.id);
      if (error) throw error;

      // Keep peak_equity in sync so drawdown math doesn't go negative
      await supabase
        .from('ai_settings')
        .update({ peak_equity: value })
        .eq('user_id', user.id)
        .gt('peak_equity', value);

      await supabase
        .from('equity_history')
        .insert({ user_id: user.id, equity: value });

      setCurrentBalance(value);
      toast.success(`Paper balance set to $${value.toLocaleString()}`);
    } catch (e) {
      console.error('Set balance error:', e);
      toast.error('Failed to update paper balance');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Not authenticated');
        return;
      }

      // Reset paper account balance to initial $100,000
      const { error: accountError } = await supabase
        .from('paper_account')
        .update({ balance: 100000 })
        .eq('user_id', user.id);

      if (accountError) throw accountError;

      if (clearHistory) {
        // Delete paper trades
        await supabase
          .from('trades')
          .delete()
          .eq('user_id', user.id)
          .eq('is_paper', true);

        // Delete paper positions
        await supabase
          .from('positions')
          .delete()
          .eq('user_id', user.id)
          .eq('is_paper', true);

        // Delete equity history
        await supabase
          .from('equity_history')
          .delete()
          .eq('user_id', user.id);

        // Add fresh equity point
        await supabase
          .from('equity_history')
          .insert({ user_id: user.id, equity: 100000 });

        // Reset AI settings drawdown tracking
        await supabase
          .from('ai_settings')
          .update({
            current_drawdown: 0,
            peak_equity: 100000,
            daily_loss_today: 0,
            weekly_loss_current: 0,
            kill_switch_active: false,
            kill_switch_triggered_at: null,
          })
          .eq('user_id', user.id);

        toast.success('Paper balance reset to $100,000 and history cleared!');
      } else {
        toast.success('Paper balance reset to $100,000!');
      }

      setIsOpen(false);
      setClearHistory(false);
    } catch (error) {
      console.error('Reset error:', error);
      toast.error('Failed to reset paper balance');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center gap-2 mb-6">
        <RefreshCcw className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Paper Trading Reset</h3>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-secondary/30">
          <p className="font-medium text-foreground mb-2">Reset Paper Balance</p>
          <p className="text-sm text-muted-foreground mb-3">
            Start fresh with a new $100,000 virtual balance. You can optionally clear all trading history.
          </p>
          
          <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full gap-2">
                <RefreshCcw className="w-4 h-4" />
                Reset Paper Balance
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Reset Paper Trading Account?
                </AlertDialogTitle>
                <AlertDialogDescription className="space-y-4">
                  <p>
                    This will reset your paper trading balance back to <strong>$100,000</strong>.
                  </p>
                  
                  <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                    <Checkbox 
                      id="clearHistory"
                      checked={clearHistory}
                      onCheckedChange={(checked) => setClearHistory(checked === true)}
                    />
                    <label htmlFor="clearHistory" className="text-sm cursor-pointer">
                      <span className="font-medium text-foreground">Also clear trading history</span>
                      <p className="text-muted-foreground mt-1">
                        Delete all paper trades, positions, and equity history for a completely fresh start.
                      </p>
                    </label>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleReset}
                  disabled={isResetting}
                  className="bg-primary hover:bg-primary/90"
                >
                  {isResetting ? 'Resetting...' : 'Reset Balance'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="p-4 rounded-lg bg-secondary/30 space-y-3">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            <p className="font-medium text-foreground">Set Custom Paper Balance (Testing)</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Override your paper balance to any amount. Useful for testing strategies at different equity levels.
            {currentBalance !== null && (
              <> Current: <span className="text-foreground font-medium">${currentBalance.toLocaleString()}</span></>
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="customBalance" className="text-xs text-muted-foreground">New balance (USD)</Label>
            <div className="flex gap-2">
              <Input
                id="customBalance"
                type="number"
                min="0"
                step="0.01"
                value={customBalance}
                onChange={(e) => setCustomBalance(e.target.value)}
                placeholder="100000"
              />
              <Button onClick={handleSetCustomBalance} disabled={isSaving} className="shrink-0">
                {isSaving ? 'Saving…' : 'Set Balance'}
              </Button>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          This only affects paper trading. Live accounts are not modified.
        </p>
      </div>
    </div>
  );
}

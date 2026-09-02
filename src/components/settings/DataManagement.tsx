import { useCallback, useEffect, useState } from 'react';
import { Database, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function DataManagement() {
  const { user } = useAuth();
  const [counts, setCounts] = useState({ trades: 0, paperTrades: 0, positions: 0 });
  const [isExporting, setIsExporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadCounts = useCallback(async () => {
    if (!user) return;
    const [all, paper, positions] = await Promise.all([
      supabase.from('trades').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase
        .from('trades')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_paper', true),
      supabase
        .from('positions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_paper', true),
    ]);
    setCounts({
      trades: all.count ?? 0,
      paperTrades: paper.count ?? 0,
      positions: positions.count ?? 0,
    });
  }, [user]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  const handleExport = async () => {
    if (!user) return;
    setIsExporting(true);
    try {
      const [trades, positions, equity, settings, scalp] = await Promise.all([
        supabase.from('trades').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('positions').select('*').eq('user_id', user.id),
        supabase.from('equity_history').select('*').eq('user_id', user.id).order('recorded_at', { ascending: true }),
        supabase.from('ai_settings').select('*').eq('user_id', user.id),
        supabase.from('scalp_settings').select('*').eq('user_id', user.id),
      ]);

      const payload = {
        exportedAt: new Date().toISOString(),
        account: { id: user.id, email: user.email },
        trades: trades.data ?? [],
        positions: positions.data ?? [],
        equityHistory: equity.data ?? [],
        aiSettings: settings.data ?? [],
        scalpSettings: scalp.data ?? [],
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `titanai-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearPaperHistory = async () => {
    if (!user) return;
    setIsClearing(true);
    try {
      const { error: posError } = await supabase
        .from('positions')
        .delete()
        .eq('user_id', user.id)
        .eq('is_paper', true);
      if (posError) throw posError;

      const { error: tradeError } = await supabase
        .from('trades')
        .delete()
        .eq('user_id', user.id)
        .eq('is_paper', true);
      if (tradeError) throw tradeError;

      toast.success('Paper trading history cleared');
      setDialogOpen(false);
      loadCounts();
    } catch (e) {
      console.error(e);
      toast.error('Could not clear history. Please try again.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center gap-2 mb-6">
        <Database className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Data & Storage</h3>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-secondary/30 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">Trade History</span>
            <span className="text-sm text-muted-foreground">{counts.trades} trades</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Paper trades</span>
            <span>{counts.paperTrades}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Open paper positions</span>
            <span>{counts.positions}</span>
          </div>
        </div>

        <Button variant="outline" className="w-full gap-2" onClick={handleExport} disabled={isExporting}>
          <Download className="w-4 h-4" />
          {isExporting ? 'Preparing export...' : 'Export All Data'}
        </Button>

        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" className="w-full gap-2" disabled={counts.paperTrades === 0}>
              <Trash2 className="w-4 h-4" />
              Clear Paper Trading History
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear paper trading history?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes your {counts.paperTrades} paper trades, open paper positions
                and paper equity history. Your paper balance and live data are untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleClearPaperHistory} disabled={isClearing}>
                {isClearing ? 'Clearing...' : 'Clear history'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

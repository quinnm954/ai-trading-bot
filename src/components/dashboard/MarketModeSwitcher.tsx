import { Bitcoin, LineChart, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMarketMode, type MarketMode } from '@/hooks/useMarketMode';

/**
 * Compact crypto/stocks switch for the dashboard header so the active market is
 * always visible and one tap away. Mirrors the Settings toggle behaviour.
 */
export function MarketModeSwitcher() {
  const { mode, hasAlpacaKeys, loading, saving, changeMode } = useMarketMode();
  const { toast } = useToast();

  const pick = async (next: MarketMode) => {
    if (next === mode || saving) return;
    if (next === 'stocks' && !hasAlpacaKeys) {
      toast({
        title: 'Connect Alpaca first',
        description:
          'Stock prices come from Alpaca. Add your Alpaca keys under API Keys, then switch to stocks.',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await changeMode(next);
    if (error) {
      toast({ title: 'Could not switch markets', description: error, variant: 'destructive' });
      return;
    }
    toast({
      title: next === 'stocks' ? 'Now trading stocks' : 'Now trading crypto',
      description:
        next === 'stocks'
          ? 'Practice stock trades are simulated in-app at real prices, during US market hours.'
          : 'Back to around-the-clock crypto trading on Coinbase.',
    });
  };

  if (loading) {
    return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
        <Button
          variant={mode === 'crypto' ? 'default' : 'ghost'}
          size="sm"
          className="gap-1.5 h-8"
          disabled={saving}
          onClick={() => pick('crypto')}
        >
          <Bitcoin className="w-3.5 h-3.5" />
          Crypto
        </Button>
        <Button
          variant={mode === 'stocks' ? 'default' : 'ghost'}
          size="sm"
          className="gap-1.5 h-8"
          disabled={saving}
          onClick={() => pick('stocks')}
        >
          <LineChart className="w-3.5 h-3.5" />
          Stocks
        </Button>
      </div>
      {!hasAlpacaKeys && (
        <Button variant="link" size="sm" className="h-8 px-1 text-xs" asChild>
          <Link to="/api-keys">Connect Alpaca</Link>
        </Button>
      )}
    </div>
  );
}

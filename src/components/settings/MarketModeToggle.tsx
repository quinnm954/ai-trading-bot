import { Bitcoin, LineChart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useMarketMode, type MarketMode } from '@/hooks/useMarketMode';

/**
 * Chooses which market this account trades. Crypto (Coinbase) is the default and
 * keeps working exactly as before; stocks route through Alpaca with their own
 * market-hours gating and tighter exit geometry.
 */
export function MarketModeToggle() {
  const { mode, hasAlpacaKeys, loading, saving, changeMode } = useMarketMode();
  const { toast } = useToast();

  const pick = async (next: MarketMode) => {
    if (next === mode) return;
    if (next === 'stocks' && !hasAlpacaKeys) {
      toast({
        title: 'Add your stock brokerage keys first',
        description: 'Connect an Alpaca account under API Keys, then switch to stocks.',
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
          ? 'Entries only run while the US market is open, with equity-sized stops and no commission assumption.'
          : 'Back to 24/7 crypto trading on Coinbase with the usual settings.',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Market</CardTitle>
        <CardDescription>
          Pick what this account trades. One market is active at a time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              variant={mode === 'crypto' ? 'default' : 'outline'}
              disabled={saving}
              onClick={() => pick('crypto')}
              className="justify-start h-auto py-3"
            >
              <Bitcoin className="w-4 h-4 mr-2" />
              <span className="text-left">
                Crypto
                <span className="block text-xs opacity-80">Coinbase · around the clock</span>
              </span>
            </Button>

            <Button
              variant={mode === 'stocks' ? 'default' : 'outline'}
              disabled={saving}
              onClick={() => pick('stocks')}
              className="justify-start h-auto py-3"
            >
              <LineChart className="w-4 h-4 mr-2" />
              <span className="text-left">
                Stocks
                <span className="block text-xs opacity-80">
                  {hasAlpacaKeys ? 'Alpaca · market hours only' : 'Needs Alpaca keys'}
                </span>
              </span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { BarChart3, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { OrderBookCard } from '@/components/trading/OrderBookCard';

const PRESETS = [
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'XRP-USD', 'DOGE-USD',
  'ADA-USD', 'AVAX-USD', 'LINK-USD', 'SHIB-USD', 'PEPE-USD',
];

export default function MarketDepth() {
  const [product, setProduct] = useState('BTC-USD');
  const [custom, setCustom] = useState('');

  const activeProduct = (custom.trim() ? custom.trim().toUpperCase() : product);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <BarChart3 className="h-7 w-7 text-primary" />
          Market Depth
        </h1>
        <p className="text-muted-foreground">
          Live Level 2 bids and asks straight from the exchange — the same book the agents trade against.
        </p>
      </div>

      <div className="glass-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-6">
        <div className="flex-1 space-y-1.5">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">Market</label>
          <Select
            value={product}
            onValueChange={(v) => { setProduct(v); setCustom(''); }}
          >
            <SelectTrigger className="min-h-[44px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 space-y-1.5">
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Or type a pair (e.g. WIF-USD)
          </label>
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="SYMBOL-USD"
            className="min-h-[44px] font-mono uppercase"
            spellCheck={false}
          />
        </div>
      </div>

      <OrderBookCard productId={activeProduct} />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          This view is read-only by design: entries and exits stay with the trading agents so every
          order passes your risk limits, reward-to-risk floor, and stop rules. Manual orders would
          bypass those checks.
        </AlertDescription>
      </Alert>
    </div>
  );
}

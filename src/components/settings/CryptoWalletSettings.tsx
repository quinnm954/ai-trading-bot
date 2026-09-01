import { useEffect, useState } from 'react';
import { Wallet, Loader2, Save, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { toast } from 'sonner';

const CHAINS = [
  { value: 'base', label: 'Base (recommended — cents in gas fees)' },
  { value: 'polygon', label: 'Polygon' },
];

const isValidAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value.trim());

/**
 * Owner-only config for the wallet that receives subscription payments.
 * Payments go straight from the buyer's wallet to this address.
 */
export function CryptoWalletSettings() {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState('');
  const [chain, setChain] = useState('base');
  const [price, setPrice] = useState('29');
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('crypto_payment_config')
        .select('*')
        .eq('id', true)
        .maybeSingle();

      if (!active) return;
      if (error) {
        console.error('Could not load crypto payment config:', error);
        toast.error('Could not load payment settings');
      } else if (data) {
        setAddress(data.wallet_address ?? '');
        setChain(data.chain ?? 'base');
        setPrice(String(data.price_usd ?? 29));
        setEnabled(Boolean(data.enabled));
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [isAdmin]);

  if (adminLoading || !isAdmin) return null;

  const handleSave = async () => {
    const trimmed = address.trim();

    if (enabled && !isValidAddress(trimmed)) {
      toast.error('Enter a valid wallet address', {
        description: 'It should start with 0x and be 42 characters long.',
      });
      return;
    }

    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Enter a valid monthly price');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('crypto_payment_config')
      .update({
        wallet_address: trimmed || null,
        chain,
        price_usd: priceNum,
        enabled,
      })
      .eq('id', true);

    setSaving(false);

    if (error) {
      console.error('Could not save crypto payment config:', error);
      toast.error('Could not save payment settings', { description: error.message });
      return;
    }
    toast.success(enabled ? 'Crypto payments are live' : 'Payment settings saved');
  };

  return (
    <div className="glass-panel p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Crypto Payments</h3>
        </div>
        <Badge variant={enabled ? 'default' : 'secondary'} className="text-xs">
          {enabled ? 'Live' : 'Off'}
        </Badge>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="h-10 rounded-lg bg-secondary/40" />
          <div className="h-10 rounded-lg bg-secondary/40" />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Subscribers send USDC straight to this wallet. Nothing sits with a payment company, and
            no fees are taken out — the buyer pays a few cents of network gas.
          </p>

          <div className="space-y-2">
            <Label htmlFor="crypto-chain">Network</Label>
            <Select value={chain} onValueChange={setChain}>
              <SelectTrigger id="crypto-chain">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHAINS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="crypto-address">Receiving wallet address (USDC)</Label>
            <Input
              id="crypto-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="0x…"
              className="font-mono text-sm"
              spellCheck={false}
            />
            {address.trim() && !isValidAddress(address) && (
              <p className="text-xs text-destructive">
                That doesn't look like a valid address (needs 0x + 40 hex characters).
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="crypto-price">Monthly price (USD)</Label>
            <Input
              id="crypto-price"
              type="number"
              min="1"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="max-w-[140px]"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-4">
            <div className="pr-4">
              <p className="font-medium text-foreground">Accept payments</p>
              <p className="text-sm text-muted-foreground">
                Turn on once your address is correct. Users can't check out while this is off.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Double-check the address character by character. Payments go directly on-chain and
              cannot be reversed or recovered if the address is wrong. Use a wallet you control,
              such as Coinbase Wallet, Rainbow, or MetaMask.{' '}
              <a
                href="https://www.coinbase.com/wallet"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                Get a wallet <ExternalLink className="h-3 w-3" />
              </a>
            </AlertDescription>
          </Alert>

          <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save payment settings
          </Button>
        </div>
      )}
    </div>
  );
}

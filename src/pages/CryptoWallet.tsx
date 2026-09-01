import { useCallback, useEffect, useState } from 'react';
import {
  Wallet, Loader2, RefreshCw, ExternalLink, ShieldCheck, ArrowUpRight, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  CHAINS, formatUnits, shortenAddress, useWeb3Wallet,
} from '@/hooks/useWeb3Wallet';
import { CryptoPaymentDialog } from '@/components/subscription/CryptoPaymentDialog';
import { MONTHLY_PRICE_USD } from '@/lib/pricing';
import { useSpotPrice } from '@/hooks/useSpotPrice';
import { toast } from 'sonner';

interface InvoiceRow {
  id: string;
  amount_usdc: number;
  wallet_address: string;
  chain: string;
  token: string;
  status: string;
  tx_hash: string | null;
  from_address: string | null;
  confirmed_at: string | null;
  created_at: string;
}

const statusVariant = (status: string) =>
  status === 'confirmed' ? 'default' : status === 'expired' ? 'destructive' : 'secondary';

export default function CryptoWallet() {
  const { user } = useAuth();
  const {
    hasWallet, address, chainId, isConnecting, connect, disconnect, switchChain, readUsdcBalance,
  } = useWeb3Wallet();

  const [chainKey, setChainKey] = useState('base');
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [payOpen, setPayOpen] = useState(false);

  const chain = CHAINS[chainKey];
  // Live USDC/USD spot from Coinbase — USDC is not assumed to be exactly $1.00
  const { price: usdcSpot } = useSpotPrice('USDC-USD', { coingeckoId: 'usd-coin' });

  const loadBalance = useCallback(async () => {
    if (!address) {
      setBalance(null);
      return;
    }
    setLoadingBalance(true);
    try {
      setBalance(await readUsdcBalance(address, chain));
    } catch (err) {
      console.error('USDC balance read failed:', err);
      toast.error('Could not read your USDC balance');
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [address, chain, readUsdcBalance]);

  useEffect(() => { void loadBalance(); }, [loadBalance]);

  const loadInvoices = useCallback(async () => {
    if (!user) return;
    setLoadingInvoices(true);
    const { data, error } = await supabase
      .from('crypto_invoices')
      .select('id, amount_usdc, wallet_address, chain, token, status, tx_hash, from_address, confirmed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Could not load payment history:', error);
    } else {
      setInvoices((data ?? []) as InvoiceRow[]);
    }
    setLoadingInvoices(false);
  }, [user]);

  useEffect(() => { void loadInvoices(); }, [loadInvoices]);

  const wrongNetwork = Boolean(address && chainId && chainId !== chain.id);
  const paid = invoices.filter((i) => i.status === 'confirmed');
  const totalPaid = paid.reduce((sum, i) => sum + Number(i.amount_usdc || 0), 0);

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Wallet className="h-7 w-7 text-primary" />
          Crypto Wallet
        </h1>
        <p className="text-muted-foreground">
          Connect your own wallet to pay for Full Access and track every USDC payment on-chain.
        </p>
      </div>

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>Self-custody only.</strong> TitanAI never holds your funds or keys. Your USDC stays
          in your wallet, and payments go directly from your wallet to the receiving address —
          there's nothing to deposit here and nothing to withdraw.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Connected wallet + balance */}
        <div className="glass-panel p-4 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">Your wallet</h2>
            <div className="flex items-center gap-2">
              <Select value={chainKey} onValueChange={setChainKey}>
                <SelectTrigger className="h-9 w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(CHAINS).map((c) => (
                    <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => void loadBalance()}
                disabled={!address || loadingBalance}
                aria-label="Refresh balance"
              >
                {loadingBalance
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {!hasWallet ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                No browser wallet detected. Install Coinbase Wallet or MetaMask, or pay from a mobile
                wallet using the QR code in checkout.
              </p>
              <Button asChild variant="outline" className="gap-2">
                <a href="https://www.coinbase.com/wallet" target="_blank" rel="noopener noreferrer">
                  Get a wallet <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </div>
          ) : !address ? (
            <Button
              className="w-full gap-2 min-h-[44px] sm:w-auto"
              onClick={() => void connect()}
              disabled={isConnecting}
            >
              {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              Connect wallet
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-secondary/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">USDC on {chain.name}</p>
                <p className="mt-1 text-3xl font-bold text-foreground">
                  {balance === null ? '—' : `${formatUnits(balance)} USDC`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {balance === null || usdcSpot === null
                    ? 'Fetching live rate…'
                    : `≈ $${(Number(formatUnits(balance)) * usdcSpot).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} at $${usdcSpot.toFixed(4)}/USDC`}
                </p>
                <a
                  href={`${chain.explorer}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                >
                  {shortenAddress(address)} <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              {wrongNetwork && (
                <Alert variant="destructive">
                  <Info className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
                    Your wallet is on another network.
                    <Button size="sm" variant="outline" onClick={() => void switchChain(chain)}>
                      Switch to {chain.name}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1 gap-2 min-h-[44px]" onClick={() => setPayOpen(true)}>
                  <ArrowUpRight className="h-4 w-4" />
                  Pay ${MONTHLY_PRICE_USD} for 30 days
                </Button>
                <Button variant="outline" className="min-h-[44px]" onClick={disconnect}>
                  Disconnect
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="glass-panel p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">Payments</h2>
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Total paid</p>
              <p className="text-2xl font-bold text-foreground">
                ${totalPaid.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Confirmed payments</p>
              <p className="text-2xl font-bold text-foreground">{paid.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Monthly price</p>
              <p className="text-2xl font-bold text-foreground">${MONTHLY_PRICE_USD}</p>
            </div>
          </div>
        </div>
      </div>

      {/* History */}
      <div className="glass-panel p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Transaction history</h2>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => void loadInvoices()}
            aria-label="Refresh history"
          >
            {loadingInvoices
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {loadingInvoices ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-secondary/40" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No payments yet. Your USDC transfers will appear here with a link to the on-chain
            transaction.
          </p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const chainInfo = CHAINS[inv.chain] ?? CHAINS.base;
              return (
                <div
                  key={inv.id}
                  className="flex flex-col gap-2 rounded-lg bg-secondary/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {Number(inv.amount_usdc).toFixed(6)} {inv.token}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {chainInfo.name}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(inv.confirmed_at ?? inv.created_at).toLocaleString()}
                      {inv.from_address && (
                        <span className="ml-2 font-mono">from {shortenAddress(inv.from_address)}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(inv.status)} className="text-xs capitalize">
                      {inv.status}
                    </Badge>
                    {inv.tx_hash && (
                      <a
                        href={`${chainInfo.explorer}/tx/${inv.tx_hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Receipt <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CryptoPaymentDialog open={payOpen} onOpenChange={setPayOpen} />
    </div>
  );
}

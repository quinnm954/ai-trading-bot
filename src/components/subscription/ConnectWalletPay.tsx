import { useState } from 'react';
import { Wallet, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CHAINS, shortenAddress, toBaseUnits, useWeb3Wallet,
} from '@/hooks/useWeb3Wallet';
import type { CryptoInvoice } from '@/hooks/useCryptoCheckout';
import { toast } from 'sonner';

interface Props {
  invoice: CryptoInvoice;
  onSent?: () => void;
}

/**
 * Non-custodial one-click pay: the user's own wallet signs the USDC transfer
 * to the receiving address. We never touch keys or funds.
 */
export function ConnectWalletPay({ invoice, onSent }: Props) {
  const { hasWallet, address, isConnecting, connect, sendUsdc } = useWeb3Wallet();
  const [isSending, setIsSending] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const chain = CHAINS[invoice.chain] ?? CHAINS.base;

  if (!hasWallet) {
    return (
      <Alert>
        <Wallet className="h-4 w-4" />
        <AlertDescription className="text-xs">
          No browser wallet detected — scan the QR code or copy the details above to pay from a
          mobile wallet.{' '}
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
    );
  }

  const handlePay = async () => {
    setIsSending(true);
    try {
      const hash = await sendUsdc({
        to: invoice.wallet_address,
        baseUnits: invoice.amount_base_units
          ? BigInt(invoice.amount_base_units)
          : toBaseUnits(invoice.amount),
        tokenAddress: invoice.token_address || chain.usdc,
        chain,
      });
      setTxHash(hash);
      toast.success('Transfer sent', {
        description: 'Access unlocks as soon as it confirms on-chain.',
      });
      onSent?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment was not sent';
      toast.error('Could not send payment', { description: message.slice(0, 200) });
    } finally {
      setIsSending(false);
    }
  };

  if (txHash) {
    return (
      <div className="rounded-lg border border-profit/30 bg-profit/10 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <CheckCircle2 className="h-4 w-4 text-profit" />
          Transfer submitted
        </p>
        <a
          href={`${chain.explorer}/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 break-all text-xs text-primary hover:underline"
        >
          View on {chain.name} explorer <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {address ? (
        <>
          <Button className="w-full gap-2 min-h-[44px]" onClick={handlePay} disabled={isSending}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Pay {invoice.amount} {invoice.token} from my wallet
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Connected: <span className="font-mono">{shortenAddress(address)}</span> · you approve the
            transfer in your wallet
          </p>
        </>
      ) : (
        <Button
          variant="outline"
          className="w-full gap-2 min-h-[44px]"
          onClick={() => void connect()}
          disabled={isConnecting}
        >
          {isConnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
          Connect wallet & pay
        </Button>
      )}
    </div>
  );
}

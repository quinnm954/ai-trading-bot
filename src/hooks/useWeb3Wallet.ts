import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal non-custodial wallet connection (EIP-1193 injected provider:
 * MetaMask, Coinbase Wallet, Rabby, Brave…).
 *
 * The app NEVER holds funds or keys: it only asks the user's own wallet to
 * sign a USDC transfer straight to the receiving address. No extra deps —
 * calldata is hand-encoded (ERC-20 transfer / balanceOf).
 */

export interface ChainInfo {
  id: number;
  key: string;
  name: string;
  usdc: string;
  explorer: string;
  rpc: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const CHAINS: Record<string, ChainInfo> = {
  base: {
    id: 8453,
    key: 'base',
    name: 'Base',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    explorer: 'https://basescan.org',
    rpc: 'https://mainnet.base.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  polygon: {
    id: 137,
    key: 'polygon',
    name: 'Polygon',
    usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    explorer: 'https://polygonscan.com',
    rpc: 'https://polygon-rpc.com',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  },
};

export const USDC_DECIMALS = 6;

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
};

function getProvider(): Eip1193Provider | null {
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth ?? null;
}

const pad32 = (hexNoPrefix: string) => hexNoPrefix.toLowerCase().padStart(64, '0');

export function encodeTransfer(to: string, baseUnits: bigint): string {
  return `0xa9059cbb${pad32(to.replace(/^0x/, ''))}${pad32(baseUnits.toString(16))}`;
}

export function encodeBalanceOf(owner: string): string {
  return `0x70a08231${pad32(owner.replace(/^0x/, ''))}`;
}

/** "29.000123" -> 29000123n (6-decimal USDC base units), no float rounding. */
export function toBaseUnits(amount: string, decimals = USDC_DECIMALS): bigint {
  const [whole, frac = ''] = amount.trim().split('.');
  const fracPadded = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(`${whole || '0'}${fracPadded}`);
}

export function formatUnits(value: bigint, decimals = USDC_DECIMALS, maxFrac = 2): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, '0').slice(0, maxFrac);
  const wholeStr = whole.toLocaleString('en-US');
  return `${negative ? '-' : ''}${wholeStr}${maxFrac > 0 ? `.${frac}` : ''}`;
}

export function shortenAddress(address: string): string {
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
}

export function useWeb3Wallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasWallet = Boolean(getProvider());

  // Re-attach to an already-authorised wallet without prompting
  useEffect(() => {
    const provider = getProvider();
    if (!provider) return;
    let active = true;

    (async () => {
      try {
        const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
        const hexChain = (await provider.request({ method: 'eth_chainId' })) as string;
        if (!active) return;
        if (accounts?.length) setAddress(accounts[0]);
        if (hexChain) setChainId(Number.parseInt(hexChain, 16));
      } catch {
        /* wallet locked or unavailable — stay disconnected */
      }
    })();

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAddress(accounts?.length ? accounts[0] : null);
    };
    const onChain = (...args: unknown[]) => {
      const hex = args[0] as string;
      setChainId(hex ? Number.parseInt(hex, 16) : null);
    };

    provider.on?.('accountsChanged', onAccounts);
    provider.on?.('chainChanged', onChain);

    return () => {
      active = false;
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      setError('No browser wallet found. Install MetaMask or Coinbase Wallet.');
      return null;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      const hexChain = (await provider.request({ method: 'eth_chainId' })) as string;
      const next = accounts?.[0] ?? null;
      setAddress(next);
      setChainId(hexChain ? Number.parseInt(hexChain, 16) : null);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Wallet connection was rejected';
      setError(message);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    // Injected wallets have no programmatic disconnect — we just forget locally.
    setAddress(null);
  }, []);

  /** Ask the wallet to switch (and add, if unknown) the target network. */
  const switchChain = useCallback(async (chain: ChainInfo) => {
    const provider = getProvider();
    if (!provider) return false;
    const hexId = `0x${chain.id.toString(16)}`;
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexId }] });
      setChainId(chain.id);
      return true;
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: hexId,
              chainName: chain.name,
              rpcUrls: [chain.rpc],
              blockExplorerUrls: [chain.explorer],
              nativeCurrency: chain.nativeCurrency,
            }],
          });
          setChainId(chain.id);
          return true;
        } catch {
          return false;
        }
      }
      setError(err instanceof Error ? err.message : 'Could not switch network');
      return false;
    }
  }, []);

  /** USDC balance of `owner`, read through a public RPC (works without a wallet). */
  const readUsdcBalance = useCallback(async (owner: string, chain: ChainInfo) => {
    const res = await fetch(chain.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: chain.usdc, data: encodeBalanceOf(owner) }, 'latest'],
      }),
    });
    const json = await res.json();
    if (json?.error) throw new Error(json.error.message ?? 'RPC error');
    const hex = json?.result as string | undefined;
    return hex && hex !== '0x' ? BigInt(hex) : 0n;
  }, []);

  /**
   * Request an ERC-20 USDC transfer from the connected wallet.
   * Returns the transaction hash the user's wallet broadcast.
   */
  const sendUsdc = useCallback(async (params: {
    to: string;
    baseUnits: bigint;
    tokenAddress: string;
    chain: ChainInfo;
  }) => {
    const provider = getProvider();
    if (!provider) throw new Error('No browser wallet found');

    let from = address;
    if (!from) from = await connect();
    if (!from) throw new Error('Wallet not connected');

    const currentHex = (await provider.request({ method: 'eth_chainId' })) as string;
    if (Number.parseInt(currentHex, 16) !== params.chain.id) {
      const ok = await switchChain(params.chain);
      if (!ok) throw new Error(`Switch your wallet to ${params.chain.name} and try again`);
    }

    const txHash = (await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from,
        to: params.tokenAddress,
        data: encodeTransfer(params.to, params.baseUnits),
        value: '0x0',
      }],
    })) as string;

    return txHash;
  }, [address, connect, switchChain]);

  return {
    hasWallet,
    address,
    chainId,
    isConnecting,
    error,
    connect,
    disconnect,
    switchChain,
    readUsdcBalance,
    sendUsdc,
  };
}

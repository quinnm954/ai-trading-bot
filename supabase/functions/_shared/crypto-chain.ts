/**
 * Keyless on-chain helpers for verifying direct USDC payments.
 * Uses public RPC endpoints — no API key, no third-party payment processor.
 */

export interface ChainConfig {
  name: string;
  rpcUrls: string[];
  usdcAddress: string;
  usdcDecimals: number;
  explorerTx: string;
  /** Approximate blocks per hour, used to bound the initial scan window. */
  blocksPerHour: number;
  chainId: number;
}

export const CHAINS: Record<string, ChainConfig> = {
  base: {
    name: 'Base',
    // publicnode first: the official endpoint rate-limits eth_getLogs
    rpcUrls: [
      'https://base-rpc.publicnode.com',
      'https://base.llamarpc.com',
      'https://mainnet.base.org',
    ],
    usdcAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    usdcDecimals: 6,
    explorerTx: 'https://basescan.org/tx/',
    blocksPerHour: 1800, // ~2s blocks
    chainId: 8453,
  },
  polygon: {
    name: 'Polygon',
    rpcUrls: [
      'https://polygon-rpc.com',
      'https://polygon-bor-rpc.publicnode.com',
    ],
    usdcAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    usdcDecimals: 6,
    explorerTx: 'https://polygonscan.com/tx/',
    blocksPerHour: 1700, // ~2.1s blocks
    chainId: 137,
  },
};

/** keccak256("Transfer(address,address,uint256)") */
export const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export function toHexQuantity(n: number | bigint): string {
  return '0x' + BigInt(n).toString(16);
}

/** Left-pads an address to a 32-byte log topic. */
export function addressToTopic(address: string): string {
  const clean = address.toLowerCase().replace(/^0x/, '');
  return '0x' + clean.padStart(64, '0');
}

/** Pulls a 20-byte address out of a 32-byte topic. */
export function topicToAddress(topic: string): string {
  return '0x' + topic.slice(-40).toLowerCase();
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

/** Converts a decimal token amount to integer base units (no float drift). */
export function toBaseUnits(amount: string | number, decimals: number): bigint {
  const s = typeof amount === 'number' ? amount.toFixed(decimals) : amount.trim();
  const neg = s.startsWith('-');
  const [intPart, fracPart = ''] = s.replace(/^-/, '').split('.');
  const frac = fracPart.slice(0, decimals).padEnd(decimals, '0');
  const value = BigInt(`${intPart || '0'}${frac}`);
  return neg ? -value : value;
}

/** Formats integer base units back to a decimal string. */
export function fromBaseUnits(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const abs = neg ? -value : value;
  const s = abs.toString().padStart(decimals + 1, '0');
  const intPart = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return `${neg ? '-' : ''}${intPart}${frac ? '.' + frac : ''}`;
}

/** JSON-RPC call that falls through to the next endpoint on failure. */
export async function rpcCall<T>(
  chain: ChainConfig,
  method: string,
  params: unknown[],
): Promise<T> {
  let lastError: unknown = null;

  for (const url of chain.rpcUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        lastError = new Error(`${url} returned ${res.status}: ${await res.text()}`);
        continue;
      }

      const json = await res.json();
      if (json.error) {
        lastError = new Error(`${url} RPC error: ${JSON.stringify(json.error)}`);
        continue;
      }
      return json.result as T;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `All RPC endpoints failed for ${method}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

export async function getBlockNumber(chain: ChainConfig): Promise<number> {
  const hex = await rpcCall<string>(chain, 'eth_blockNumber', []);
  return Number(BigInt(hex));
}

export interface TransferLog {
  txHash: string;
  from: string;
  to: string;
  value: bigint;
  blockNumber: number;
}

/** Fetches incoming USDC transfers to `recipient` within a block range. */
export async function getIncomingTransfers(
  chain: ChainConfig,
  recipient: string,
  fromBlock: number,
  toBlock: number,
): Promise<TransferLog[]> {
  const logs = await rpcCall<Array<{
    transactionHash: string;
    topics: string[];
    data: string;
    blockNumber: string;
  }>>(chain, 'eth_getLogs', [{
    address: chain.usdcAddress,
    fromBlock: toHexQuantity(fromBlock),
    toBlock: toHexQuantity(toBlock),
    topics: [TRANSFER_TOPIC, null, addressToTopic(recipient)],
  }]);

  return (logs || []).map((log) => ({
    txHash: log.transactionHash,
    from: topicToAddress(log.topics[1]),
    to: topicToAddress(log.topics[2]),
    value: BigInt(log.data === '0x' ? '0x0' : log.data),
    blockNumber: Number(BigInt(log.blockNumber)),
  }));
}

/** EIP-681 payment URI so wallet apps prefill the transfer. */
export function buildPaymentUri(
  chain: ChainConfig,
  recipient: string,
  amountBaseUnits: bigint,
): string {
  return `ethereum:${chain.usdcAddress}@${chain.chainId}/transfer?address=${recipient}&uint256=${amountBaseUnits.toString()}`;
}

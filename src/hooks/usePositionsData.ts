import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Position {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number | null;
  unrealizedPnl: number | null;
  pnlPercent: number;
  strategy: string | null;
  marketType: 'stocks' | 'crypto';
  isPaper: boolean;
  createdAt: Date;
}

// Symbol mapping for CoinGecko API
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'XRP': 'ripple',
  'DOGE': 'dogecoin', 'ADA': 'cardano', 'AVAX': 'avalanche-2', 'DOT': 'polkadot',
  'MATIC': 'matic-network', 'POL': 'matic-network', 'LINK': 'chainlink',
  'UNI': 'uniswap', 'LTC': 'litecoin', 'SHIB': 'shiba-inu', 'PEPE': 'pepe',
  'FLOKI': 'floki', 'BONK': 'bonk', 'WIF': 'dogwifcoin', 'WLD': 'worldcoin-wld',
  'ONDO': 'ondo-finance', 'JUP': 'jupiter-exchange-solana', 'VET': 'vechain',
  'CHZ': 'chiliz', 'GALA': 'gala', 'SAND': 'the-sandbox', 'MANA': 'decentraland',
  'APE': 'apecoin', 'INJ': 'injective-protocol', 'TIA': 'celestia', 'SEI': 'sei-network',
  'ARB': 'arbitrum', 'OP': 'optimism', 'IMX': 'immutable-x', 'NEAR': 'near',
  'FET': 'fetch-ai', 'RENDER': 'render-token', 'AAVE': 'aave', 'MKR': 'maker',
  'GRT': 'the-graph', 'LDO': 'lido-dao', 'CRV': 'curve-dao-token', 'CAKE': 'pancakeswap-token',
  'APT': 'aptos', 'HBAR': 'hedera-hashgraph', 'ATOM': 'cosmos', 'ALGO': 'algorand',
  'ENJ': 'enjincoin', 'STX': 'stacks', 'TAO': 'bittensor', 'SUI': 'sui',
  'XLM': 'stellar', 'BAT': 'basic-attention-token', 'TON': 'the-open-network',
  'TRX': 'tron', 'ICP': 'internet-computer', 'FIL': 'filecoin', 'ETC': 'ethereum-classic',
  'XTZ': 'tezos', 'EOS': 'eos', 'FLOW': 'flow', 'NEO': 'neo', 'KAS': 'kaspa',
  'RUNE': 'thorchain', 'PYTH': 'pyth-network', 'CFX': 'conflux-token',
  'CRO': 'crypto-com-chain', 'EGLD': 'elrond-erd-2', 'THETA': 'theta-token',
  'IOTA': 'iota', 'KAVA': 'kava', 'MINA': 'mina-protocol', 'ZIL': 'zilliqa',
  'ENS': 'ethereum-name-service', 'SNX': 'havven', 'COMP': 'compound-governance-token',
  '1INCH': '1inch', 'CELO': 'celo', 'QTUM': 'qtum', 'ZRX': '0x', 'ANKR': 'ankr',
  'LRC': 'loopring', 'SKL': 'skale', 'ICX': 'icon', 'ONE': 'harmony',
  'STORJ': 'storj', 'OCEAN': 'ocean-protocol', 'RPL': 'rocket-pool', 'GMX': 'gmx',
  'AXS': 'axie-infinity', 'BLUR': 'blur', 'XEC': 'ecash', 'BCH': 'bitcoin-cash',
  'OKB': 'okb',
};

async function fetchLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  // Map symbols to CoinGecko IDs
  const ids = symbols
    .map(s => SYMBOL_TO_COINGECKO[s.toUpperCase()])
    .filter(Boolean);
  
  if (ids.length === 0) return prices;
  
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
    );
    
    if (response.ok) {
      const data = await response.json();
      
      // Map back to original symbols
      for (const symbol of symbols) {
        const geckoId = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
        if (geckoId && data[geckoId]?.usd) {
          prices[symbol.toUpperCase()] = data[geckoId].usd;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching live prices:', error);
  }
  
  return prices;
}

export function usePositionsData(isPaper: boolean = true) {
  const { user } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const priceUpdateInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_paper', isPaper);

      if (error) throw error;

      const rawPositions = (data || []).map(pos => ({
        id: pos.id,
        symbol: pos.symbol,
        side: pos.side as 'buy' | 'sell',
        quantity: Number(pos.quantity),
        avgEntryPrice: Number(pos.avg_entry_price),
        currentPrice: pos.current_price ? Number(pos.current_price) : null,
        unrealizedPnl: pos.unrealized_pnl ? Number(pos.unrealized_pnl) : null,
        pnlPercent: 0,
        strategy: pos.strategy,
        marketType: pos.market_type as 'stocks' | 'crypto',
        isPaper: pos.is_paper,
        createdAt: new Date(pos.created_at || ''),
      }));

      // Fetch live prices for all position symbols
      const symbols = [...new Set(rawPositions.map(p => p.symbol))];
      const livePrices = await fetchLivePrices(symbols);
      
      // Update positions with live prices and calculate P&L
      const updatedPositions: Position[] = rawPositions.map(pos => {
        const livePrice = livePrices[pos.symbol.toUpperCase()] || pos.currentPrice || pos.avgEntryPrice;
        
        // Calculate P&L based on side
        let unrealizedPnl = 0;
        let pnlPercent = 0;
        
        if (pos.side === 'buy') {
          // Long position: profit when price goes up
          unrealizedPnl = (livePrice - pos.avgEntryPrice) * pos.quantity;
          pnlPercent = ((livePrice - pos.avgEntryPrice) / pos.avgEntryPrice) * 100;
        } else {
          // Short position: profit when price goes down
          unrealizedPnl = (pos.avgEntryPrice - livePrice) * pos.quantity;
          pnlPercent = ((pos.avgEntryPrice - livePrice) / pos.avgEntryPrice) * 100;
        }
        
        return {
          ...pos,
          currentPrice: livePrice,
          unrealizedPnl,
          pnlPercent,
        };
      });

      // Filter out dust positions (< $1 notional value) — these are leftover
      // tiny balances from broker syncs that clutter the UI.
      const DUST_THRESHOLD_USD = 1;
      const cleanedPositions = updatedPositions.filter(pos => {
        const notional = (pos.currentPrice ?? 0) * pos.quantity;
        return notional >= DUST_THRESHOLD_USD;
      });

      setPositions(cleanedPositions);
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isPaper]);

  // Aggressive real-time price updates every 5 seconds
  useEffect(() => {
    fetchPositions();

    // Set up aggressive real-time price polling (5 seconds)
    priceUpdateInterval.current = setInterval(() => {
      fetchPositions();
    }, 5000);

    // Subscribe to position changes with status monitoring
    const channel = supabase
      .channel(`positions-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'positions',
        },
        () => {
          fetchPositions();
        }
      )
      .subscribe((status) => {
        console.log('[Positions] Channel status:', status);
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Positions] Channel error, data still refreshing via interval');
        }
      });

    // Refresh on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[Positions] Tab visible, refreshing');
        fetchPositions();
      }
    };

    // Refresh on focus
    const handleFocus = () => {
      fetchPositions();
    };

    // Refresh when back online
    const handleOnline = () => {
      console.log('[Positions] Back online, refreshing');
      fetchPositions();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      if (priceUpdateInterval.current) {
        clearInterval(priceUpdateInterval.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      supabase.removeChannel(channel);
    };
  }, [fetchPositions]);

  return { positions, isLoading, refetch: fetchPositions };
}
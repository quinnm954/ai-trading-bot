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
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'XRP': 'ripple',
  'DOGE': 'dogecoin',
  'ADA': 'cardano',
  'AVAX': 'avalanche-2',
  'DOT': 'polkadot',
  'MATIC': 'matic-network',
  'LINK': 'chainlink',
  'UNI': 'uniswap',
  'LTC': 'litecoin',
  'SHIB': 'shiba-inu',
  'PEPE': 'pepe',
  'FLOKI': 'floki',
  'BONK': 'bonk',
  'WIF': 'dogwifcoin',
  'WLD': 'worldcoin-wld',
  'ONDO': 'ondo-finance',
  'JUP': 'jupiter-exchange-solana',
  'VET': 'vechain',
  'CHZ': 'chiliz',
  'GALA': 'gala',
  'SAND': 'the-sandbox',
  'MANA': 'decentraland',
  'APE': 'apecoin',
  'INJ': 'injective-protocol',
  'TIA': 'celestia',
  'SEI': 'sei-network',
  'ARB': 'arbitrum',
  'OP': 'optimism',
  'IMX': 'immutable-x',
  'NEAR': 'near',
  'FET': 'fetch-ai',
  'RENDER': 'render-token',
  'AAVE': 'aave',
  'MKR': 'maker',
  'GRT': 'the-graph',
  'LDO': 'lido-dao',
  'CRV': 'curve-dao-token',
  'CAKE': 'pancakeswap-token',
  'XLM': 'stellar',
  'HBAR': 'hedera-hashgraph',
  'APT': 'aptos',
  'BAT': 'basic-attention-token',
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
  const priceUpdateInterval = useRef<NodeJS.Timeout | null>(null);

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

      setPositions(updatedPositions);
    } catch (error) {
      console.error('Error fetching positions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isPaper]);

  // Real-time price updates every 10 seconds
  useEffect(() => {
    fetchPositions();

    // Set up real-time price polling
    priceUpdateInterval.current = setInterval(() => {
      fetchPositions();
    }, 10000); // Update every 10 seconds

    // Subscribe to position changes
    const channel = supabase
      .channel('positions-changes')
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
      .subscribe();

    return () => {
      if (priceUpdateInterval.current) {
        clearInterval(priceUpdateInterval.current);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchPositions]);

  return { positions, isLoading, refetch: fetchPositions };
}
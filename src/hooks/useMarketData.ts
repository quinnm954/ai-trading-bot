import { useState, useEffect, useCallback } from 'react';

export interface MarketDataPoint {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high24h: number;
  low24h: number;
}

const CRYPTO_IDS = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple'];
const SYMBOL_MAP: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
  cardano: 'ADA',
  ripple: 'XRP',
};

export function useMarketData() {
  const [marketData, setMarketData] = useState<MarketDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMarketData = useCallback(async () => {
    try {
      const ids = CRYPTO_IDS.join(',');
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch market data');
      }

      const data = await response.json();

      const formattedData: MarketDataPoint[] = data.map((coin: any) => ({
        symbol: SYMBOL_MAP[coin.id] || coin.symbol.toUpperCase(),
        name: coin.name,
        price: coin.current_price,
        change: coin.price_change_24h,
        changePercent: coin.price_change_percentage_24h,
        high24h: coin.high_24h,
        low24h: coin.low_24h,
      }));

      setMarketData(formattedData);
      setError(null);
    } catch (err) {
      console.error('Error fetching market data:', err);
      setError('Failed to load market data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMarketData();

    // Refresh every 60 seconds (CoinGecko free tier rate limit)
    const intervalId = setInterval(fetchMarketData, 60000);

    return () => clearInterval(intervalId);
  }, [fetchMarketData]);

  return { marketData, isLoading, error, refetch: fetchMarketData };
}

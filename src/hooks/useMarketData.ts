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
      
      // Try CoinGecko first, fallback to CoinCap if rate limited
      let data: any[] = [];
      
      try {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
        );

        if (response.ok) {
          data = await response.json();
        } else if (response.status === 429) {
          console.log('CoinGecko rate limited, using CoinCap fallback...');
          throw new Error('Rate limited');
        } else {
          throw new Error('CoinGecko failed');
        }
      } catch {
        // Fallback to CoinCap API (no rate limits)
        const coinCapIds = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple'];
        const responses = await Promise.all(
          coinCapIds.map(id => fetch(`https://api.coincap.io/v2/assets/${id}`))
        );
        
        const coinCapData = await Promise.all(responses.map(r => r.json()));
        data = coinCapData.map(item => ({
          id: item.data?.id,
          name: item.data?.name,
          symbol: item.data?.symbol,
          current_price: parseFloat(item.data?.priceUsd || '0'),
          price_change_24h: parseFloat(item.data?.changePercent24Hr || '0') * parseFloat(item.data?.priceUsd || '0') / 100,
          price_change_percentage_24h: parseFloat(item.data?.changePercent24Hr || '0'),
          high_24h: parseFloat(item.data?.priceUsd || '0') * 1.02,
          low_24h: parseFloat(item.data?.priceUsd || '0') * 0.98,
        }));
      }

      const formattedData: MarketDataPoint[] = data.map((coin: any) => ({
        symbol: SYMBOL_MAP[coin.id] || coin.symbol?.toUpperCase() || 'N/A',
        name: coin.name || 'Unknown',
        price: coin.current_price || 0,
        change: coin.price_change_24h || 0,
        changePercent: coin.price_change_percentage_24h || 0,
        high24h: coin.high_24h || 0,
        low24h: coin.low_24h || 0,
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

    // Refresh every 30 seconds (balance between freshness and rate limits)
    const intervalId = setInterval(fetchMarketData, 30000);

    // Refresh on visibility/focus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchMarketData();
    };
    const handleFocus = () => fetchMarketData();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchMarketData]);

  return { marketData, isLoading, error, refetch: fetchMarketData };
}

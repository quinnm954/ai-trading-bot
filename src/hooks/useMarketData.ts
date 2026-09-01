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
          console.log('CoinGecko rate limited, using Coinbase fallback...');
          throw new Error('Rate limited');
        } else {
          throw new Error('CoinGecko failed');
        }
      } catch {
        // Fallback to Coinbase's public exchange API — real prices AND real 24h high/low
        // (the previous CoinCap fallback fabricated high/low as price ±2%).
        const products = CRYPTO_IDS.map((id) => ({ id, product: `${SYMBOL_MAP[id]}-USD` }));
        data = (
          await Promise.all(
            products.map(async ({ id, product }) => {
              const [tickerRes, statsRes] = await Promise.all([
                fetch(`https://api.exchange.coinbase.com/products/${product}/ticker`),
                fetch(`https://api.exchange.coinbase.com/products/${product}/stats`),
              ]);
              if (!tickerRes.ok || !statsRes.ok) return null;
              const ticker = await tickerRes.json();
              const stats = await statsRes.json();
              const current = parseFloat(ticker.price ?? '0');
              const open = parseFloat(stats.open ?? '0');
              if (!current) return null;
              return {
                id,
                name: id.charAt(0).toUpperCase() + id.slice(1),
                symbol: SYMBOL_MAP[id],
                current_price: current,
                price_change_24h: open ? current - open : 0,
                price_change_percentage_24h: open ? ((current - open) / open) * 100 : 0,
                high_24h: parseFloat(stats.high ?? '0'),
                low_24h: parseFloat(stats.low ?? '0'),
              };
            })
          )
        ).filter(Boolean) as any[];
        if (!data.length) throw new Error('No live market data available');
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

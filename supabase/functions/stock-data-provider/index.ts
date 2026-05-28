import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * =============================================================================
 * STOCK DATA PROVIDER - Multi-Asset Market Data Service
 * =============================================================================
 * 
 * PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
 * PATENT REFERENCE: Asset-Aware Intelligence (Patent Claim 2)
 * 
 * This edge function provides stock market data for US equities trading.
 * It complements the existing crypto data providers to enable the patent's
 * multi-asset class trading capability.
 * 
 * DATA SOURCES:
 * - Alpaca Markets API (primary) - Real-time quotes and bars
 * - Yahoo Finance (fallback) - Free tier for basic data
 * - IEX Cloud (alternative) - If configured
 * 
 * FEATURES:
 * - Real-time stock quotes
 * - Historical OHLCV bars
 * - Market hours detection
 * - Stock-specific trading rules
 * 
 * =============================================================================
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// US Stock Market Holidays (closed days)
const MARKET_HOLIDAYS_2024_2025 = [
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27',
  '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
];

interface StockQuote {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: string;
}

interface StockBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MarketStatus {
  isOpen: boolean;
  session: 'pre-market' | 'regular' | 'after-hours' | 'closed';
  message: string;
  nextOpen: string | null;
}

/**
 * Check if US stock market is currently open
 */
function getMarketStatus(): MarketStatus {
  const now = new Date();
  
  // Convert to Eastern Time
  const etOptions: Intl.DateTimeFormatOptions = { 
    timeZone: 'America/New_York', 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  };
  const etTime = new Intl.DateTimeFormat('en-US', etOptions).format(now);
  const [hours, minutes] = etTime.split(':').map(Number);
  const timeInMinutes = hours * 60 + minutes;
  
  // Get day of week (0 = Sunday)
  const dayFormatter = new Intl.DateTimeFormat('en-US', { 
    timeZone: 'America/New_York', 
    weekday: 'short' 
  });
  const dayOfWeek = dayFormatter.format(now);
  
  // Get date for holiday check
  const dateFormatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'America/New_York' 
  });
  const todayStr = dateFormatter.format(now);
  
  // Check weekend
  if (dayOfWeek === 'Sat' || dayOfWeek === 'Sun') {
    return {
      isOpen: false,
      session: 'closed',
      message: 'Market closed for weekend',
      nextOpen: 'Monday 9:30 AM ET',
    };
  }
  
  // Check holidays
  if (MARKET_HOLIDAYS_2024_2025.includes(todayStr)) {
    return {
      isOpen: false,
      session: 'closed',
      message: 'Market closed for holiday',
      nextOpen: 'Next trading day 9:30 AM ET',
    };
  }
  
  // Market timing (minutes from midnight ET)
  const PRE_MARKET = 4 * 60;      // 4:00 AM
  const REGULAR_OPEN = 9.5 * 60;  // 9:30 AM
  const REGULAR_CLOSE = 16 * 60;  // 4:00 PM
  const AFTER_CLOSE = 20 * 60;    // 8:00 PM
  
  if (timeInMinutes < PRE_MARKET) {
    return {
      isOpen: false,
      session: 'closed',
      message: 'Market opens at 4:00 AM ET (pre-market)',
      nextOpen: '4:00 AM ET',
    };
  } else if (timeInMinutes < REGULAR_OPEN) {
    return {
      isOpen: true,
      session: 'pre-market',
      message: 'Pre-market session (limited liquidity)',
      nextOpen: null,
    };
  } else if (timeInMinutes < REGULAR_CLOSE) {
    return {
      isOpen: true,
      session: 'regular',
      message: 'Regular trading hours',
      nextOpen: null,
    };
  } else if (timeInMinutes < AFTER_CLOSE) {
    return {
      isOpen: true,
      session: 'after-hours',
      message: 'After-hours session (limited liquidity)',
      nextOpen: null,
    };
  } else {
    return {
      isOpen: false,
      session: 'closed',
      message: 'Market closed for the day',
      nextOpen: 'Tomorrow 4:00 AM ET',
    };
  }
}

/**
 * Alpaca quotes removed — Yahoo Finance is the primary data source.
 */
async function fetchAlpacaQuotes(_symbols: string[]): Promise<StockQuote[]> {
  return [];
}

/**
 * Fetch stock data from Yahoo Finance (fallback)
 */
async function fetchYahooQuotes(symbols: string[]): Promise<StockQuote[]> {
  const quotes: StockQuote[] = [];
  
  // Yahoo Finance chart API
  for (const symbol of symbols.slice(0, 10)) { // Limit to avoid rate limits
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`
      );
      
      if (!response.ok) continue;
      
      const data = await response.json();
      const result = data.chart?.result?.[0];
      
      if (result) {
        const meta = result.meta;
        const quote = result.indicators?.quote?.[0];
        
        quotes.push({
          symbol,
          price: meta.regularMarketPrice || 0,
          open: quote?.open?.[0] || meta.regularMarketOpen || 0,
          high: quote?.high?.[0] || meta.regularMarketDayHigh || 0,
          low: quote?.low?.[0] || meta.regularMarketDayLow || 0,
          close: meta.previousClose || 0,
          volume: quote?.volume?.[0] || meta.regularMarketVolume || 0,
          change: (meta.regularMarketPrice || 0) - (meta.previousClose || 0),
          changePercent: ((meta.regularMarketPrice || 0) - (meta.previousClose || 0)) / (meta.previousClose || 1) * 100,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`Yahoo fetch error for ${symbol}:`, error);
    }
  }
  
  return quotes;
}

/**
 * Get historical bars from Alpaca
 */
async function fetchAlpacaBars(
  symbol: string, 
  timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day',
  limit: number = 100
): Promise<StockBar[]> {
  const apiKey = Deno.env.get('ALPACA_API_KEY');
  const apiSecret = Deno.env.get('ALPACA_API_SECRET');
  
  if (!apiKey || !apiSecret) {
    return [];
  }
  
  try {
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      }
    );
    
    if (!response.ok) return [];
    
    const data = await response.json();
    
    return (data.bars || []).map((bar: any) => ({
      timestamp: bar.t,
      open: bar.o,
      high: bar.h,
      low: bar.l,
      close: bar.c,
      volume: bar.v,
    }));
  } catch (error) {
    console.error('Alpaca bars fetch error:', error);
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, symbols, symbol, timeframe, limit } = body;

    console.log(`📈 Stock Data Provider: ${action}`);

    switch (action) {
      case 'market_status': {
        const status = getMarketStatus();
        return new Response(
          JSON.stringify({ success: true, ...status }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'quotes': {
        if (!symbols || !Array.isArray(symbols)) {
          return new Response(
            JSON.stringify({ error: 'symbols array required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        // Try Alpaca first, fallback to Yahoo
        let quotes = await fetchAlpacaQuotes(symbols);
        
        if (quotes.length === 0) {
          console.log('Falling back to Yahoo Finance');
          quotes = await fetchYahooQuotes(symbols);
        }

        return new Response(
          JSON.stringify({ success: true, quotes }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'bars': {
        if (!symbol) {
          return new Response(
            JSON.stringify({ error: 'symbol required' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          );
        }

        const bars = await fetchAlpacaBars(
          symbol, 
          timeframe || '1Day',
          limit || 100
        );

        return new Response(
          JSON.stringify({ success: true, bars }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'top_movers': {
        // Get a predefined list of popular stocks and their quotes
        const popularStocks = [
          'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 
          'JPM', 'V', 'JNJ', 'WMT', 'PG', 'XOM', 'SPY', 'QQQ'
        ];

        let quotes = await fetchAlpacaQuotes(popularStocks);
        
        if (quotes.length === 0) {
          quotes = await fetchYahooQuotes(popularStocks);
        }

        // Sort by absolute change percent
        const sorted = quotes.sort((a, b) => 
          Math.abs(b.changePercent) - Math.abs(a.changePercent)
        );

        return new Response(
          JSON.stringify({ 
            success: true, 
            gainers: sorted.filter(q => q.changePercent > 0).slice(0, 5),
            losers: sorted.filter(q => q.changePercent < 0).slice(0, 5),
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
  } catch (error) {
    console.error('Stock data provider error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

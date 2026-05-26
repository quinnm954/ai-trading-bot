import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

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

async function fetchLivePricesForDashboard(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const ids = symbols.map(s => SYMBOL_TO_COINGECKO[s.toUpperCase()]).filter(Boolean);
  
  if (ids.length === 0) {
    return prices;
  }
  
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`;
    const response = await fetch(url);
    
    if (response.ok) {
      const data = await response.json();
      
      for (const symbol of symbols) {
        const geckoId = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
        if (geckoId && data[geckoId]?.usd) {
          prices[symbol.toUpperCase()] = data[geckoId].usd;
        }
      }
    }
  } catch (error) {
    console.error('[Dashboard] Error fetching live prices:', error);
  }
  
  return prices;
}

interface DashboardStats {
  cashBalance: number;
  positionsValue: number;
  totalEquity: number;
  dailyPnl: number;
  dailyPnlPercent: number;
  weeklyPnl: number;
  weeklyPnlPercent: number;
  totalPnl: number;
  totalPnlPercent: number;
  openPositions: number;
  todayTrades: number;
  tradingMode: 'paper' | 'live';
}

export interface DashboardPosition {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  pnlPercent: number;
  value: number;
  initialInvestment: number;
}

interface LiveAccount {
  provider: string;
  balance: number;
  equity: number;
  buyingPower: number;
  lastSynced: Date | null;
}

export function useDashboardData() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    cashBalance: 0,
    positionsValue: 0,
    totalEquity: 0,
    dailyPnl: 0,
    dailyPnlPercent: 0,
    weeklyPnl: 0,
    weeklyPnlPercent: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    openPositions: 0,
    todayTrades: 0,
    tradingMode: 'paper',
  });
  const [positions, setPositions] = useState<DashboardPosition[]>([]);
  const [liveAccounts, setLiveAccounts] = useState<LiveAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRealtimeUpdate, setIsRealtimeUpdate] = useState(false);
  const refreshCounter = useRef(0);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const fetchId = ++refreshCounter.current;
    console.log(`[Dashboard] Fetch #${fetchId} starting...`);

    try {
      // Fetch AI settings for trading mode
      const { data: aiSettings } = await supabase
        .from('ai_settings')
        .select('trading_mode')
        .eq('user_id', user.id)
        .maybeSingle();

      const tradingMode = (aiSettings?.trading_mode as 'paper' | 'live') || 'paper';

      // Fetch paper account
      const { data: paperAccount } = await supabase
        .from('paper_account')
        .select('balance, initial_balance')
        .eq('user_id', user.id)
        .maybeSingle();

      const initialBalance = paperAccount?.initial_balance || 100000;

      // Fetch live accounts
      const { data: liveAccountsData } = await supabase
        .from('live_account')
        .select('*')
        .eq('user_id', user.id);

      const formattedLiveAccounts: LiveAccount[] = (liveAccountsData || []).map(acc => ({
        provider: acc.provider,
        balance: acc.balance,
        equity: acc.equity,
        buyingPower: acc.buying_power,
        lastSynced: acc.last_synced_at ? new Date(acc.last_synced_at) : null,
      }));

      setLiveAccounts(formattedLiveAccounts);

      // Fetch positions
      const { data: positionsData, count: positionsCount } = await supabase
        .from('positions')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('is_paper', tradingMode === 'paper');

      // Fetch live prices for positions from CoinGecko
      let positionsValue = 0;
      let unrealizedPnl = 0;
      const formattedPositions: DashboardPosition[] = [];
      
      if (positionsData && positionsData.length > 0) {
        const symbols = [...new Set(positionsData.map(p => p.symbol))];
        const livePrices = await fetchLivePricesForDashboard(symbols);
        
        positionsData.forEach(pos => {
          const livePrice = livePrices[pos.symbol.toUpperCase()] || pos.current_price || pos.avg_entry_price;
          const quantity = Number(pos.quantity);
          const entryPrice = Number(pos.avg_entry_price);
          const value = quantity * Number(livePrice);
          
          positionsValue += value;
          
          // Calculate unrealized P&L
          let posUnrealizedPnl = 0;
          let pnlPercent = 0;
          
          if (entryPrice > 0) {
            if (pos.side === 'buy') {
              posUnrealizedPnl = (Number(livePrice) - entryPrice) * quantity;
              pnlPercent = ((Number(livePrice) - entryPrice) / entryPrice) * 100;
            } else {
              posUnrealizedPnl = (entryPrice - Number(livePrice)) * quantity;
              pnlPercent = ((entryPrice - Number(livePrice)) / entryPrice) * 100;
            }
            unrealizedPnl += posUnrealizedPnl;
          }
          
          const initialInvestment = entryPrice * quantity;
          
          formattedPositions.push({
            id: pos.id,
            symbol: pos.symbol,
            side: pos.side as 'buy' | 'sell',
            quantity,
            avgEntryPrice: entryPrice,
            currentPrice: Number(livePrice),
            unrealizedPnl: posUnrealizedPnl,
            pnlPercent,
            value,
            initialInvestment,
          });
        });
      }

      // Fetch today's trades and calculate P&L
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - 7);
      
      const { data: allTrades } = await supabase
        .from('trades')
        .select('pnl, closed_at, created_at')
        .eq('user_id', user.id)
        .eq('is_paper', tradingMode === 'paper')
        .eq('status', 'closed');

      // Calculate P&L from trades
      let dailyPnl = 0;
      let weeklyPnl = 0;
      let totalPnl = 0;
      let todayTradesCount = 0;

      if (allTrades) {
        allTrades.forEach(trade => {
          const pnl = Number(trade.pnl) || 0;
          const closedAt = trade.closed_at ? new Date(trade.closed_at) : null;
          
          totalPnl += pnl;
          
          if (closedAt) {
            if (closedAt >= today) {
              dailyPnl += pnl;
              todayTradesCount++;
            }
            if (closedAt >= weekStart) {
              weeklyPnl += pnl;
            }
          }
        });
      }

      // Calculate cash balance based on mode
      let cashBalance = paperAccount?.balance || 100000;
      
      if (tradingMode === 'live' && formattedLiveAccounts.length > 0) {
        cashBalance = formattedLiveAccounts.reduce((sum, acc) => sum + acc.balance, 0);
      }

      // Total equity = cash + positions value
      const totalEquity = cashBalance + positionsValue;

      // Calculate percentages based on total equity
      const dailyPnlPercent = totalEquity > 0 ? (dailyPnl / totalEquity) * 100 : 0;
      const weeklyPnlPercent = totalEquity > 0 ? (weeklyPnl / totalEquity) * 100 : 0;
      
      // Combined P&L calculation
      let totalPnlPercent = 0;
      let combinedPnl = totalPnl + unrealizedPnl;
      
      if (tradingMode === 'paper') {
        totalPnlPercent = initialBalance > 0 ? ((totalEquity - initialBalance) / initialBalance) * 100 : 0;
      } else {
        const costBasis = totalEquity - combinedPnl;
        totalPnlPercent = costBasis > 0 ? (combinedPnl / costBasis) * 100 : 0;
      }

      // Only update state if this is the most recent fetch
      if (fetchId === refreshCounter.current) {
        setPositions(formattedPositions);
        setStats({
          cashBalance,
          positionsValue,
          totalEquity,
          dailyPnl,
          dailyPnlPercent,
          weeklyPnl,
          weeklyPnlPercent,
          totalPnl: combinedPnl,
          totalPnlPercent,
          openPositions: positionsCount || 0,
          todayTrades: todayTradesCount,
          tradingMode,
        });
        setLastUpdated(new Date());
        console.log(`[Dashboard] Fetch #${fetchId} complete: equity=$${totalEquity.toFixed(2)}, positions=$${positionsValue.toFixed(2)}`);
      }
    } catch (error) {
      console.error('[Dashboard] Error fetching data:', error);
    } finally {
      if (fetchId === refreshCounter.current) {
        setIsLoading(false);
      }
    }
  }, [user]);

  // Trigger pulse animation
  const triggerRealtimeUpdate = useCallback(() => {
    setIsRealtimeUpdate(true);
    setTimeout(() => setIsRealtimeUpdate(false), 1500);
  }, []);

  useEffect(() => {
    fetchData();
    
    // Subscribe to real-time updates with reconnection handling
    const setupChannels = () => {
      const suffix = Math.random().toString(36).slice(2);
      const tradesChannel = supabase
        .channel(`dashboard-trades-changes-${suffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'trades' },
          () => { triggerRealtimeUpdate(); fetchData(); }
        )
        .subscribe();

      const positionsChannel = supabase
        .channel(`dashboard-positions-changes-${suffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'positions' },
          () => { triggerRealtimeUpdate(); fetchData(); }
        )
        .subscribe();

      const paperChannel = supabase
        .channel(`dashboard-paper-changes-${suffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'paper_account' },
          () => { triggerRealtimeUpdate(); fetchData(); }
        )
        .subscribe();

      const liveAccountChannel = supabase
        .channel(`dashboard-live-account-changes-${suffix}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'live_account' },
          () => { triggerRealtimeUpdate(); fetchData(); }
        )
        .subscribe();

      return { tradesChannel, positionsChannel, paperChannel, liveAccountChannel };
    };

    const channels = setupChannels();

    // Consistent 5-second refresh for ALL data (stats + positions together)
    const intervalId = setInterval(() => {
      fetchData();
    }, 5000);

    // Refresh on visibility/focus/online
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    const handleFocus = () => fetchData();
    const handleOnline = () => fetchData();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      supabase.removeChannel(channels.tradesChannel);
      supabase.removeChannel(channels.positionsChannel);
      supabase.removeChannel(channels.paperChannel);
      supabase.removeChannel(channels.liveAccountChannel);
    };
  }, [fetchData, triggerRealtimeUpdate]);

  return {
    stats,
    positions,
    liveAccounts,
    isLoading,
    lastUpdated,
    isRealtimeUpdate,
    refetch: fetchData,
  };
}

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import type { RiskSettings } from '@/types/trading';

type TradingMode = 'paper' | 'live';
type BotStatus = 'idle' | 'learning' | 'trading' | 'paused' | 'error';
type ExecutionMode = 'autonomous' | 'user_confirmed';

interface AISettings {
  enabled: boolean;
  botStatus: BotStatus;
  tradingMode: TradingMode;
  executionMode: ExecutionMode;
  maxCapitalUsage: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxConcurrentTrades: number;
  allowedMarkets: string[];
}

interface AccountBalance {
  provider: string;
  balance: number;
  buyingPower: number;
  equity: number;
  lastSynced: Date | null;
}

interface PaperAccount {
  balance: number;
  initialBalance: number;
}

export function useAITraderData() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [aiSettings, setAISettings] = useState<AISettings>({
    enabled: false,
    botStatus: 'idle',
    tradingMode: 'paper',
    executionMode: 'autonomous',
    maxCapitalUsage: 80,
    maxPositionSize: 10,
    maxDailyLoss: 5,
    maxConcurrentTrades: 5,
    allowedMarkets: ['stocks', 'crypto'],
  });
  
  const [paperAccount, setPaperAccount] = useState<PaperAccount>({
    balance: 100000,
    initialBalance: 100000,
  });
  
  const [liveAccounts, setLiveAccounts] = useState<AccountBalance[]>([]);
  const [connectedBrokers, setConnectedBrokers] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRealtimeUpdate, setIsRealtimeUpdate] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      // Fetch AI settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('ai_settings')
        .select('*')
        .maybeSingle();

      if (settingsError) {
        console.error('Error fetching AI settings:', settingsError);
      } else if (settingsData) {
        setAISettings({
          enabled: settingsData.enabled ?? false,
          botStatus: (settingsData.bot_status as BotStatus) ?? 'idle',
          tradingMode: (settingsData.trading_mode as TradingMode) ?? 'paper',
          executionMode: (settingsData.execution_mode as ExecutionMode) ?? 'autonomous',
          maxCapitalUsage: Number(settingsData.max_capital_usage) ?? 80,
          maxPositionSize: Number(settingsData.max_position_size) ?? 10,
          maxDailyLoss: Number(settingsData.max_daily_loss) ?? 5,
          maxConcurrentTrades: settingsData.max_concurrent_trades ?? 5,
          allowedMarkets: settingsData.allowed_markets ?? ['stocks', 'crypto'],
        });
      }

      // Fetch paper account
      const { data: paperData, error: paperError } = await supabase
        .from('paper_account')
        .select('*')
        .maybeSingle();

      if (paperError) {
        console.error('Error fetching paper account:', paperError);
      } else if (paperData) {
        setPaperAccount({
          balance: Number(paperData.balance) ?? 100000,
          initialBalance: Number(paperData.initial_balance) ?? 100000,
        });
      }

      // Fetch connected brokers
      const { data: connectionsData, error: connectionsError } = await supabase
        .from('api_connections')
        .select('provider, is_connected')
        .eq('is_connected', true);

      if (connectionsError) {
        console.error('Error fetching connections:', connectionsError);
      } else if (connectionsData) {
        setConnectedBrokers(connectionsData.map(c => c.provider));
      }

      // Fetch live account balances
      const { data: liveData, error: liveError } = await supabase
        .from('live_account')
        .select('*');

      if (liveError) {
        console.error('Error fetching live accounts:', liveError);
      } else if (liveData) {
        setLiveAccounts(liveData.map(acc => ({
          provider: acc.provider,
          balance: Number(acc.balance) ?? 0,
          buyingPower: Number(acc.buying_power) ?? 0,
          equity: Number(acc.equity) ?? 0,
          lastSynced: acc.last_synced_at ? new Date(acc.last_synced_at) : null,
        })));
      }
    } catch (error) {
      console.error('Error in fetchData:', error);
    } finally {
      setIsLoading(false);
      setLastUpdated(new Date());
    }
  }, [user]);

  // Trigger pulse animation
  const triggerRealtimeUpdate = useCallback(() => {
    setIsRealtimeUpdate(true);
    setTimeout(() => setIsRealtimeUpdate(false), 1500);
  }, []);

  useEffect(() => {
    fetchData();
    
    // Subscribe to real-time paper account updates
    const paperChannel = supabase
      .channel('paper-account-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'paper_account',
        },
        (payload) => {
          console.log('Paper account update:', payload);
          triggerRealtimeUpdate();
          fetchData();
        }
      )
      .subscribe();

    // Subscribe to real-time live account updates
    const liveChannel = supabase
      .channel('live-account-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_account',
        },
        (payload) => {
          console.log('Live account update:', payload);
          triggerRealtimeUpdate();
          fetchData();
        }
      )
      .subscribe();

    // Auto-refresh every 30 seconds as backup
    const intervalId = setInterval(() => {
      fetchData();
    }, 30000);
    
    return () => {
      clearInterval(intervalId);
      supabase.removeChannel(paperChannel);
      supabase.removeChannel(liveChannel);
    };
  }, [fetchData, triggerRealtimeUpdate]);

  // Update AI settings in database
  const updateSettings = useCallback(async (updates: Partial<AISettings>) => {
    if (!user) return;

    setIsSaving(true);
    
    const dbUpdates: Record<string, unknown> = {};
    if (updates.enabled !== undefined) dbUpdates.enabled = updates.enabled;
    if (updates.botStatus !== undefined) dbUpdates.bot_status = updates.botStatus;
    if (updates.tradingMode !== undefined) dbUpdates.trading_mode = updates.tradingMode;
    if (updates.executionMode !== undefined) dbUpdates.execution_mode = updates.executionMode;
    if (updates.maxCapitalUsage !== undefined) dbUpdates.max_capital_usage = updates.maxCapitalUsage;
    if (updates.maxPositionSize !== undefined) dbUpdates.max_position_size = updates.maxPositionSize;
    if (updates.maxDailyLoss !== undefined) dbUpdates.max_daily_loss = updates.maxDailyLoss;
    if (updates.maxConcurrentTrades !== undefined) dbUpdates.max_concurrent_trades = updates.maxConcurrentTrades;
    if (updates.allowedMarkets !== undefined) dbUpdates.allowed_markets = updates.allowedMarkets;

    try {
      const { error } = await supabase
        .from('ai_settings')
        .update(dbUpdates as never)
        .eq('user_id', user.id);

      if (error) throw error;

      setAISettings(prev => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [user, toast]);

  // Toggle trading mode
  const setTradingMode = useCallback(async (mode: TradingMode) => {
    if (mode === 'live' && connectedBrokers.length === 0) {
      toast({
        title: 'No Broker Connected',
        description: 'Please connect Alpaca or Coinbase in API Keys to enable live trading.',
        variant: 'destructive',
      });
      return;
    }
    
    await updateSettings({ tradingMode: mode });
    
    toast({
      title: mode === 'live' ? 'Live Trading Mode' : 'Paper Trading Mode',
      description: mode === 'live' 
        ? 'AI Trader will now execute real trades on your connected broker accounts.'
        : 'AI Trader is now in simulation mode. No real money will be used.',
    });
  }, [connectedBrokers.length, updateSettings, toast]);

  // Run auto take-profit checker
  const runTakeProfitChecker = useCallback(async () => {
    if (!user) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      console.log('Running auto take-profit/stop-loss checker...');
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-take-profit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();
      console.log('Take-profit/stop-loss result:', result);

      if (result.takeProfitCount > 0) {
        toast({
          title: '🎯 Take Profit Hit!',
          description: `Closed ${result.takeProfitCount} position(s) at +2% profit`,
        });
        triggerRealtimeUpdate();
        fetchData();
      }

      if (result.stopLossCount > 0) {
        toast({
          title: '🛑 Stop Loss Triggered',
          description: `Closed ${result.stopLossCount} position(s) at -1% to limit losses`,
          variant: 'destructive',
        });
        triggerRealtimeUpdate();
        fetchData();
      }
    } catch (error) {
      console.error('Take-profit checker error:', error);
    }
  }, [user, toast, triggerRealtimeUpdate, fetchData]);

  // Run AI trading engine
  const runTradingEngine = useCallback(async () => {
    if (!user || !aiSettings.enabled) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      console.log('Running AI trading engine...');
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-trading-engine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await response.json();
      console.log('Trading engine result:', result);

      if (result.executedTrades?.length > 0) {
        toast({
          title: 'AI Executed Trades',
          description: `${result.executedTrades.length} trade(s) executed in ${result.regime} market`,
        });
        triggerRealtimeUpdate();
        fetchData();
      }

      // Also run take-profit checker after trading engine
      await runTakeProfitChecker();
    } catch (error) {
      console.error('Trading engine error:', error);
    }
  }, [user, aiSettings.enabled, toast, triggerRealtimeUpdate, fetchData, runTakeProfitChecker]);

  // Auto-run trading engine and take-profit/stop-loss checker continuously when enabled
  useEffect(() => {
    if (!aiSettings.enabled) return;

    console.log('🤖 AI Bot enabled - starting continuous trading loop');

    // Run immediately when enabled
    runTradingEngine();
    runTakeProfitChecker();

    // Trading engine runs every 30 seconds to find new opportunities
    const tradingInterval = setInterval(() => {
      console.log('🔄 Trading engine cycle...');
      runTradingEngine();
    }, 30000);

    // Take-profit/stop-loss checker runs every 5 seconds for fast position management
    const takeProfitInterval = setInterval(() => {
      runTakeProfitChecker();
    }, 5000);

    return () => {
      console.log('🛑 AI Bot disabled - stopping trading loop');
      clearInterval(tradingInterval);
      clearInterval(takeProfitInterval);
    };
  }, [aiSettings.enabled, runTradingEngine, runTakeProfitChecker]);

  // Toggle AI enabled
  const toggleEnabled = useCallback(async () => {
    const newEnabled = !aiSettings.enabled;
    await updateSettings({ 
      enabled: newEnabled,
      botStatus: newEnabled ? 'trading' : 'idle',
    });

    if (newEnabled) {
      toast({
        title: 'AI Trading Enabled',
        description: 'AI will now analyze markets and execute trades automatically.',
      });
    } else {
      toast({
        title: 'AI Trading Disabled',
        description: 'AI trading has been paused.',
      });
    }
  }, [aiSettings.enabled, updateSettings, toast]);

  // Get current balance based on mode
  const getCurrentBalance = useCallback(() => {
    if (aiSettings.tradingMode === 'paper') {
      return paperAccount.balance;
    }
    
    // Sum up all live account equities
    return liveAccounts.reduce((sum, acc) => sum + acc.equity, 0);
  }, [aiSettings.tradingMode, paperAccount.balance, liveAccounts]);
  // Set execution mode
  const setExecutionMode = useCallback(async (mode: ExecutionMode) => {
    await updateSettings({ executionMode: mode });
    
    toast({
      title: mode === 'autonomous' ? 'Autonomous Mode' : 'User-Confirmed Mode',
      description: mode === 'autonomous' 
        ? 'AI will execute trades automatically without requiring approval.'
        : 'All trades will require your approval before execution.',
    });
  }, [updateSettings, toast]);

  return {
    aiSettings,
    paperAccount,
    liveAccounts,
    connectedBrokers,
    isLoading,
    isSaving,
    lastUpdated,
    isRealtimeUpdate,
    tradingMode: aiSettings.tradingMode,
    executionMode: aiSettings.executionMode,
    isEnabled: aiSettings.enabled,
    currentBalance: getCurrentBalance(),
    setTradingMode,
    setExecutionMode,
    toggleEnabled,
    updateSettings,
    refetch: fetchData,
  };
}

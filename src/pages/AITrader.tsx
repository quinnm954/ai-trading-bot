import { useState } from 'react';
import { 
  Bot, 
  Zap, 
  Shield, 
  TrendingUp,
  Activity,
  AlertCircle,
  AlertTriangle,
  Settings,
  Play,
  Pause,
  Wallet,
  Banknote,
  Link2,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { RealtimeIndicator } from '@/components/ui/realtime-indicator';
import { cn } from '@/lib/utils';
import { useAITraderData } from '@/hooks/useAITraderData';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { RiskStatusCard } from '@/components/risk/RiskStatusCard';
import { LiveModeConfirmDialog } from '@/components/risk/LiveModeConfirmDialog';
import { useRiskManager } from '@/hooks/useRiskManager';
import { ExecutionModeToggle } from '@/components/trading/ExecutionModeToggle';
import { PendingTradesPanel } from '@/components/trading/PendingTradesPanel';
import { StockMarketIndicator } from '@/components/trading/StockMarketIndicator';
import { PDTWarning } from '@/components/trading/PDTWarning';

export default function AITrader() {
  const navigate = useNavigate();
  const [showLiveModeConfirm, setShowLiveModeConfirm] = useState(false);
  const { isKillSwitchActive } = useRiskManager();
  
  const {
    aiSettings,
    paperAccount,
    liveAccounts,
    connectedBrokers,
    isLoading,
    isSaving,
    lastUpdated,
    isRealtimeUpdate,
    tradingMode,
    executionMode,
    isEnabled,
    currentBalance,
    setTradingMode,
    setExecutionMode,
    toggleEnabled,
    updateSettings,
    refetch,
  } = useAITraderData();

  const toggleMarket = (market: string) => {
    const current = aiSettings.allowedMarkets;
    const updated = current.includes(market)
      ? current.filter(m => m !== market)
      : [...current, market];
    updateSettings({ allowedMarkets: updated });
  };

  // Handle live mode switch with confirmation
  const handleLiveModeClick = () => {
    if (tradingMode === 'live') {
      // Switching to paper - no confirmation needed
      setTradingMode('paper');
    } else {
      // Switching to live - show confirmation dialog
      setShowLiveModeConfirm(true);
    }
  };

  const handleLiveModeConfirmed = () => {
    setTradingMode('live');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isLiveMode = tradingMode === 'live';
  const hasConnectedBrokers = connectedBrokers.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Live Mode Confirmation Dialog */}
      <LiveModeConfirmDialog
        open={showLiveModeConfirm}
        onOpenChange={setShowLiveModeConfirm}
        onConfirmed={handleLiveModeConfirmed}
      />

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Bot className="w-7 h-7 text-primary" />
              Fully Autonomous AI Trader
            </h1>
            <span className={cn(
              "px-2 py-1 text-xs font-bold rounded-full border animate-pulse",
              isLiveMode 
                ? "bg-loss/20 text-loss border-loss/30" 
                : "bg-primary/20 text-primary border-primary/30"
            )}>
              {isLiveMode ? 'LIVE TRADING' : 'PAPER TRADING'}
            </span>
          </div>
          <p className="text-muted-foreground mt-1">
            Set your risk limits and let AI make all trading decisions automatically
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RealtimeIndicator isActive={isRealtimeUpdate} />
          {lastUpdated && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={refetch}
            className="gap-1"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stock Market Hours Indicator & PDT Warning */}
      {aiSettings.allowedMarkets.includes('stocks') && (
        <div className="flex flex-wrap items-center gap-3">
          <StockMarketIndicator />
          {/* Show PDT warning for stock accounts under $25k */}
          {liveAccounts
            .filter(acc => acc.provider === 'alpaca' || acc.provider === 'ibkr' || acc.provider === 'tradier')
            .filter(acc => acc.equity < 25000)
            .map(acc => (
              <PDTWarning 
                key={acc.provider}
                accountEquity={acc.equity}
                dayTradesLast5Days={0} // TODO: Fetch from broker API
              />
            ))
          }
        </div>
      )}

      {/* Kill Switch Banner - Show at top when active */}
      {isKillSwitchActive && (
        <div className="p-4 rounded-lg bg-loss/20 border-2 border-loss/50 animate-pulse">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-loss mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-bold text-loss text-lg">KILL SWITCH ACTIVE - TRADING HALTED</p>
              <p className="text-sm text-loss/80 mt-1">
                Trading has been automatically stopped due to exceeding maximum drawdown limit.
                Review your positions and risk settings, then reset the kill switch in the Risk Status panel below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Trading Mode Toggle */}
      <div className="glass-panel p-6 gradient-border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={cn(
              'p-3 rounded-xl transition-all',
              isLiveMode ? 'bg-loss/20' : 'bg-primary/20'
            )}>
              {isLiveMode ? (
                <Banknote className="w-6 h-6 text-loss" />
              ) : (
                <Wallet className="w-6 h-6 text-primary" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Trading Mode</h2>
              <p className="text-sm text-muted-foreground">
                {isLiveMode 
                  ? 'Real money trades on your connected broker accounts'
                  : 'Simulated trades with virtual $100k balance'
                }
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-secondary/50 p-1 rounded-lg">
            <button
              onClick={() => setTradingMode('paper')}
              disabled={isSaving}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all',
                !isLiveMode 
                  ? 'bg-primary text-primary-foreground shadow-md' 
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Paper Trading
            </button>
            <button
              onClick={handleLiveModeClick}
              disabled={isSaving || !hasConnectedBrokers}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-all',
                isLiveMode 
                  ? 'bg-loss text-white shadow-md' 
                  : 'text-muted-foreground hover:text-foreground',
                !hasConnectedBrokers && 'opacity-50 cursor-not-allowed'
              )}
            >
              Live Trading
            </button>
          </div>
        </div>

        {!hasConnectedBrokers && (
          <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-warning" />
              <span className="text-sm text-warning">
                Connect a broker to enable live trading
              </span>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/api-keys')}
            >
              Connect Broker
            </Button>
          </div>
        )}
      </div>

      {/* Execution Mode Toggle - Patent: Selectable Execution Control Modes */}
      <ExecutionModeToggle
        mode={executionMode}
        onChange={setExecutionMode}
        disabled={isSaving}
      />

      {/* Pending Trades Panel - Only show in user-confirmed mode */}
      {executionMode === 'user_confirmed' && <PendingTradesPanel />}

      {/* Account Balances + Risk Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Paper Account */}
        <div className={cn(
          'glass-panel p-6 transition-all duration-300',
          !isLiveMode && 'ring-2 ring-primary/50',
          isRealtimeUpdate && 'ring-2 ring-success/50 shadow-[0_0_20px_rgba(34,197,94,0.3)]'
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Wallet className={cn(
                'w-5 h-5 text-primary transition-all',
                isRealtimeUpdate && 'animate-pulse text-success'
              )} />
              <h3 className="text-lg font-semibold text-foreground">Paper Account</h3>
            </div>
            {!isLiveMode && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-primary/20 text-primary">
                Active
              </span>
            )}
          </div>
          
          <div className="space-y-3">
            <div className={cn(
              'p-4 rounded-lg bg-secondary/30 transition-all duration-300',
              isRealtimeUpdate && 'bg-success/10'
            )}>
              <p className="text-sm text-muted-foreground mb-1">Balance</p>
              <p className={cn(
                'text-2xl font-bold text-foreground transition-all',
                isRealtimeUpdate && 'text-success'
              )}>
                ${paperAccount.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
              <p className={cn(
                'text-sm mt-1',
                paperAccount.balance >= paperAccount.initialBalance ? 'text-profit' : 'text-loss'
              )}>
                {paperAccount.balance >= paperAccount.initialBalance ? '+' : ''}
                ${(paperAccount.balance - paperAccount.initialBalance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                {' '}
                ({((paperAccount.balance - paperAccount.initialBalance) / paperAccount.initialBalance * 100).toFixed(2)}%)
              </p>
            </div>
          </div>
        </div>

        {/* Live Accounts */}
        <div className={cn(
          'glass-panel p-6 transition-all',
          isLiveMode && 'ring-2 ring-loss/50'
        )}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-loss" />
              <h3 className="text-lg font-semibold text-foreground">Live Accounts</h3>
            </div>
            <div className="flex items-center gap-2">
              {liveAccounts.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await supabase.functions.invoke('sync-broker-balances');
                      window.location.reload();
                    } catch (e) {
                      console.error('Sync failed:', e);
                    }
                  }}
                  className="gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Sync
                </Button>
              )}
              {isLiveMode && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-loss/20 text-loss">
                  Active
                </span>
              )}
            </div>
          </div>

          {liveAccounts.length > 0 ? (
            <div className="space-y-3">
              {liveAccounts.map((account) => (
                <div key={account.provider} className="p-4 rounded-lg bg-secondary/30">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-foreground capitalize">{account.provider}</span>
                    {account.lastSynced && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" />
                        {account.lastSynced.toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                  <p className="text-xl font-bold text-foreground">
                    ${account.equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Buying Power: ${account.buyingPower.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 rounded-lg bg-secondary/30 text-center">
              <p className="text-muted-foreground text-sm">
                No broker accounts connected
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-3"
                onClick={() => navigate('/api-keys')}
              >
                Connect Broker
              </Button>
            </div>
          )}
        </div>

        {/* Risk Status Card */}
        <RiskStatusCard />
      </div>

      {/* Main Control */}
      <div className={cn(
        'glass-panel p-6 transition-all duration-500',
        isEnabled && (isLiveMode ? 'border-loss/30' : 'border-success/30')
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              'p-4 rounded-2xl transition-all duration-300',
              isEnabled 
                ? (isLiveMode ? 'bg-loss/20' : 'bg-success/20') 
                : 'bg-secondary'
            )}>
              <Bot className={cn(
                'w-8 h-8 transition-colors',
                isEnabled 
                  ? (isLiveMode ? 'text-loss' : 'text-success') 
                  : 'text-muted-foreground'
              )} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-foreground">
                  {isKillSwitchActive 
                    ? 'Trading Halted (Kill Switch)' 
                    : isEnabled 
                      ? 'Autonomous Trading Active' 
                      : 'Autonomous Trading Disabled'}
                </h2>
                {isEnabled && !isKillSwitchActive && (
                  <span className={cn(
                    'flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full',
                    isLiveMode ? 'bg-loss/20 text-loss' : 'bg-success/20 text-success'
                  )}>
                    <Zap className="w-3 h-3" />
                    {isLiveMode ? 'LIVE' : 'PAPER'}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">
                {isKillSwitchActive
                  ? 'Reset the kill switch to resume trading'
                  : isEnabled 
                    ? `AI is autonomously trading with ${isLiveMode ? 'real money' : 'simulated funds'}`
                    : 'Enable to let AI fully manage your trading'
                }
              </p>
            </div>
          </div>
          <Button 
            onClick={toggleEnabled}
            disabled={isSaving || isKillSwitchActive}
            variant={isEnabled ? 'glow-danger' : 'glow-success'}
            size="lg"
            className="gap-2"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isEnabled ? (
              <>
                <Pause className="w-5 h-5" />
                Stop Trading
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Start Trading
              </>
            )}
          </Button>
        </div>

        {isEnabled && !isKillSwitchActive && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Status</span>
              </div>
              <p className={cn(
                'text-lg font-bold',
                isLiveMode ? 'text-loss' : 'text-success'
              )}>
                {aiSettings.botStatus === 'trading' ? 'Analyzing' : aiSettings.botStatus}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Active Balance</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                ${currentBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Mode</span>
              </div>
              <p className={cn(
                'text-lg font-bold',
                isLiveMode ? 'text-loss' : 'text-primary'
              )}>
                {isLiveMode ? 'Live' : 'Paper'}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Max Daily Loss</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                ${(currentBalance * aiSettings.maxDailyLoss / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Live Mode Warning */}
      {isLiveMode && (
        <div className="p-4 rounded-lg bg-loss/10 border border-loss/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-loss mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-loss">Live Trading Mode Active</p>
              <p className="text-sm text-loss/80 mt-1">
                The AI will execute real trades using funds from your connected broker accounts. 
                All trades are final and may result in financial loss. Ensure your risk settings 
                are configured appropriately.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Risk Settings Link */}
      <div className="glass-panel p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-primary" />
            <div>
              <p className="font-medium text-foreground">Risk & Trading Settings</p>
              <p className="text-sm text-muted-foreground">
                All trading limits are configured in Risk Management
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            onClick={() => navigate('/risk-management')}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            Configure Settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Allowed Markets */}
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-6">
            <Settings className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Allowed Markets</h3>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-xl">
                  📈
                </div>
                <div>
                  <p className="font-medium text-foreground">Stocks</p>
                  <p className="text-xs text-muted-foreground">
                    US equities via Alpaca
                    {connectedBrokers.includes('alpaca') && (
                      <span className="ml-2 text-success">• Connected</span>
                    )}
                  </p>
                </div>
              </div>
              <Switch 
                checked={aiSettings.allowedMarkets.includes('stocks')}
                onCheckedChange={() => toggleMarket('stocks')}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-xl">
                  ₿
                </div>
                <div>
                  <p className="font-medium text-foreground">Crypto</p>
                  <p className="text-xs text-muted-foreground">
                    Cryptocurrencies via Coinbase
                    {connectedBrokers.includes('coinbase') && (
                      <span className="ml-2 text-success">• Connected</span>
                    )}
                  </p>
                </div>
              </div>
              <Switch 
                checked={aiSettings.allowedMarkets.includes('crypto')}
                onCheckedChange={() => toggleMarket('crypto')}
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        {/* AI Behavior */}
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-6">
            <Bot className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">AI Behavior</h3>
          </div>

          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground">Analysis Interval</span>
                <span className="text-sm text-muted-foreground">Every 1 minute</span>
              </div>
              <p className="text-xs text-muted-foreground">
                AI reviews market conditions and adjusts strategies continuously
              </p>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground">Strategy Selection</span>
                <span className="text-sm text-muted-foreground">AI Autonomous</span>
              </div>
              <p className="text-xs text-muted-foreground">
                AI picks the best strategy for current market regime based on historical performance
              </p>
            </div>

            <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-start gap-2">
                <Zap className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Risk-First Philosophy</p>
                  <p className="text-xs text-muted-foreground">
                    AI respects all limits set in Risk Management. Capital preservation is the priority.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

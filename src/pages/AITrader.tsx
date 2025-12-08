import { useState } from 'react';
import { 
  Bot, 
  Zap, 
  Shield, 
  TrendingUp,
  Activity,
  AlertCircle,
  Settings,
  Play,
  Pause
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { mockRiskSettings, mockAITraderState } from '@/lib/mockData';

export default function AITrader() {
  const [isEnabled, setIsEnabled] = useState(mockAITraderState.isEnabled);
  const [riskSettings, setRiskSettings] = useState(mockRiskSettings);
  const [allowedMarkets, setAllowedMarkets] = useState<('stocks' | 'crypto')[]>(mockRiskSettings.allowedMarkets);

  const toggleMarket = (market: 'stocks' | 'crypto') => {
    setAllowedMarkets(prev => 
      prev.includes(market) 
        ? prev.filter(m => m !== market)
        : [...prev, market]
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bot className="w-7 h-7 text-primary" />
            AI Auto-Trader
          </h1>
          <p className="text-muted-foreground">Autonomous AI trading with configurable risk controls</p>
        </div>
      </div>

      {/* Main Control */}
      <div className={cn(
        'glass-panel p-6 transition-all duration-500 gradient-border',
        isEnabled && 'border-success/30'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={cn(
              'p-4 rounded-2xl transition-all duration-300',
              isEnabled ? 'bg-success/20 glow-success' : 'bg-secondary'
            )}>
              <Bot className={cn(
                'w-8 h-8 transition-colors',
                isEnabled ? 'text-success' : 'text-muted-foreground'
              )} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                AI Auto-Trading {isEnabled ? 'Active' : 'Disabled'}
              </h2>
              <p className="text-muted-foreground">
                {isEnabled 
                  ? 'AI is actively analyzing markets and executing trades'
                  : 'Enable to let AI manage your trading automatically'
                }
              </p>
            </div>
          </div>
          <Button 
            onClick={() => setIsEnabled(!isEnabled)}
            variant={isEnabled ? 'glow-danger' : 'glow-success'}
            size="lg"
            className="gap-2"
          >
            {isEnabled ? (
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

        {isEnabled && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Status</span>
              </div>
              <p className="text-lg font-bold text-success">Analyzing</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Active Strategy</span>
              </div>
              <p className="text-lg font-bold text-foreground">EMA Crossover</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Today's Trades</span>
              </div>
              <p className="text-lg font-bold text-foreground">7</p>
            </div>
            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground">Today's P&L</span>
              </div>
              <p className="text-lg font-bold text-success">+$1,234.56</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Capital Allocation */}
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Capital Allocation</h3>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Max Capital for AI</span>
                <span className="font-mono font-medium text-foreground">{riskSettings.maxCapitalPercent}%</span>
              </div>
              <Slider
                value={[riskSettings.maxCapitalPercent]}
                onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, maxCapitalPercent: value }))}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-2">
                AI can use up to ${(125847 * riskSettings.maxCapitalPercent / 100).toLocaleString()} of your balance
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Max Position Size</span>
                <span className="font-mono font-medium text-foreground">{riskSettings.maxPositionSize}%</span>
              </div>
              <Slider
                value={[riskSettings.maxPositionSize]}
                onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, maxPositionSize: value }))}
                max={25}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Risk Controls */}
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">Risk Controls</h3>
          </div>

          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Max Daily Loss</span>
                <span className="font-mono font-medium text-destructive">-{riskSettings.maxDailyLoss}%</span>
              </div>
              <Slider
                value={[riskSettings.maxDailyLoss]}
                onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, maxDailyLoss: value }))}
                max={10}
                step={0.5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Trading stops if losses reach ${(125847 * riskSettings.maxDailyLoss / 100).toLocaleString()}
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Max Open Trades</span>
                <span className="font-mono font-medium text-foreground">{riskSettings.maxOpenTrades}</span>
              </div>
              <Slider
                value={[riskSettings.maxOpenTrades]}
                onValueChange={([value]) => setRiskSettings(prev => ({ ...prev, maxOpenTrades: value }))}
                max={20}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </div>

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
                  <p className="text-xs text-muted-foreground">US equities via Alpaca</p>
                </div>
              </div>
              <Switch 
                checked={allowedMarkets.includes('stocks')}
                onCheckedChange={() => toggleMarket('stocks')}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-xl">
                  ₿
                </div>
                <div>
                  <p className="font-medium text-foreground">Crypto</p>
                  <p className="text-xs text-muted-foreground">Cryptocurrencies via Coinbase</p>
                </div>
              </div>
              <Switch 
                checked={allowedMarkets.includes('crypto')}
                onCheckedChange={() => toggleMarket('crypto')}
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
                <span className="text-sm text-muted-foreground">Every 5 minutes</span>
              </div>
              <p className="text-xs text-muted-foreground">
                AI reviews market conditions and adjusts strategies
              </p>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-foreground">Strategy Selection</span>
                <span className="text-sm text-muted-foreground">Automatic</span>
              </div>
              <p className="text-xs text-muted-foreground">
                AI picks the best strategy based on current conditions
              </p>
            </div>

            <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-warning mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Paper Trading Only</p>
                  <p className="text-xs text-muted-foreground">
                    V1 operates in simulation mode. No real money is at risk.
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

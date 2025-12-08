import { useState } from 'react';
import { 
  Brain, 
  Sparkles, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AIRecommendation {
  strategy: string;
  timeframe: string;
  confidence: number;
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
}

const mockRecommendation: AIRecommendation = {
  strategy: 'EMA Crossover',
  timeframe: '15m',
  confidence: 78,
  positionSize: 5,
  stopLoss: 2.5,
  takeProfit: 5,
  reasoning: 'Based on analysis of the last 200 candles, BTC-USD is showing strong bullish momentum with a golden cross formation on the 15-minute chart. RSI is at 58, indicating room for upward movement without being overbought. Volume has increased 23% above the 20-period average, confirming buying pressure. Recommended entry on pullback to EMA-12 support.',
  riskLevel: 'medium',
};

export default function AIAdvisor() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(mockRecommendation);
  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USD');

  const symbols = ['BTC-USD', 'ETH-USD', 'AAPL', 'NVDA', 'TSLA', 'MSFT'];

  const analyzeMarket = async () => {
    setIsAnalyzing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    setRecommendation(mockRecommendation);
    setIsAnalyzing(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary" />
            AI Strategy Advisor
          </h1>
          <p className="text-muted-foreground">Get AI-powered trading recommendations based on market analysis</p>
        </div>
      </div>

      {/* Symbol Selection */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Select Asset</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {symbols.map((symbol) => (
            <button
              key={symbol}
              onClick={() => setSelectedSymbol(symbol)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                selectedSymbol === symbol
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {symbol}
            </button>
          ))}
        </div>
        <Button 
          onClick={analyzeMarket}
          disabled={isAnalyzing}
          variant="glow"
          className="gap-2"
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Analyze {selectedSymbol}
            </>
          )}
        </Button>
      </div>

      {/* AI Recommendation */}
      {recommendation && !isAnalyzing && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-panel p-6 gradient-border">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/20">
                  <Brain className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">AI Recommendation</h3>
                  <p className="text-sm text-muted-foreground">For {selectedSymbol}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'px-3 py-1 rounded-full text-xs font-medium',
                  recommendation.riskLevel === 'low' && 'bg-success/20 text-success',
                  recommendation.riskLevel === 'medium' && 'bg-warning/20 text-warning',
                  recommendation.riskLevel === 'high' && 'bg-destructive/20 text-destructive',
                )}>
                  {recommendation.riskLevel.toUpperCase()} RISK
                </span>
                <Button variant="ghost" size="icon" onClick={analyzeMarket}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-secondary/30 mb-6">
              <div className="flex items-start gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-foreground mb-2">AI Analysis</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {recommendation.reasoning}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Recommended Strategy</p>
                <p className="text-lg font-bold text-foreground">{recommendation.strategy}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Timeframe</p>
                <p className="text-lg font-bold text-foreground">{recommendation.timeframe}</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Position Size</p>
                <p className="text-lg font-bold text-foreground">{recommendation.positionSize}%</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                <p className="text-lg font-bold text-primary">{recommendation.confidence}%</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Risk Parameters</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span className="text-sm text-muted-foreground">Stop Loss</span>
                  <span className="font-mono font-medium text-destructive">-{recommendation.stopLoss}%</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span className="text-sm text-muted-foreground">Take Profit</span>
                  <span className="font-mono font-medium text-success">+{recommendation.takeProfit}%</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span className="text-sm text-muted-foreground">Risk/Reward</span>
                  <span className="font-mono font-medium text-foreground">
                    1:{(recommendation.takeProfit / recommendation.stopLoss).toFixed(1)}
                  </span>
                </div>
              </div>
            </div>

            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Key Signals</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="text-muted-foreground">Golden cross confirmed</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="text-muted-foreground">Volume above average</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span className="text-muted-foreground">RSI in neutral zone</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="w-4 h-4 text-warning" />
                  <span className="text-muted-foreground">Market volatility elevated</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

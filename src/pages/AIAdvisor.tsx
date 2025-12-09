import { useState, useEffect } from 'react';
import { 
  Brain, 
  Sparkles, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Zap,
  Target,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Signal {
  type: 'bullish' | 'bearish' | 'neutral';
  text: string;
}

interface AIRecommendation {
  symbol: string;
  name: string;
  strategy: string;
  timeframe: string;
  confidence: number;
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
  signals: Signal[];
  price: number;
  change24h: number;
}

interface AssetSummary {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  trend: string;
}

export default function AIAdvisor() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(null);
  const [marketOverview, setMarketOverview] = useState<string>('');
  const [allAssets, setAllAssets] = useState<AssetSummary[]>([]);
  const [alternativeAssets, setAlternativeAssets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const analyzeMarket = async () => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-strategy-advisor`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze market');
      }

      setRecommendation(data.recommendation);
      setMarketOverview(data.marketOverview);
      setAllAssets(data.allAssets || []);
      setAlternativeAssets(data.alternativeAssets || []);

      toast({
        title: 'Analysis Complete',
        description: `Best opportunity: ${data.recommendation.symbol} with ${data.recommendation.strategy}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
      toast({
        title: 'Analysis Failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-analyze on mount
  useEffect(() => {
    analyzeMarket();
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-7 h-7 text-primary" />
            AI Strategy Advisor
          </h1>
          <p className="text-muted-foreground">AI analyzes all crypto assets and recommends the best trading opportunity</p>
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
              Analyzing Markets...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Refresh Analysis
            </>
          )}
        </Button>
      </div>

      {/* Market Overview */}
      {marketOverview && (
        <div className="glass-panel p-4 border-l-4 border-l-primary">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <span className="font-medium text-foreground">Market Overview</span>
          </div>
          <p className="text-muted-foreground">{marketOverview}</p>
        </div>
      )}

      {/* Loading State */}
      {isAnalyzing && (
        <div className="glass-panel p-12 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground">Analyzing {allAssets.length || 10} Crypto Assets...</p>
          <p className="text-sm text-muted-foreground mt-2">AI is evaluating market conditions and identifying the best opportunity</p>
        </div>
      )}

      {/* Error State */}
      {error && !isAnalyzing && (
        <div className="glass-panel p-6 border-l-4 border-l-destructive">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <span className="font-medium text-destructive">Analysis Error</span>
          </div>
          <p className="text-muted-foreground">{error}</p>
          <Button onClick={analyzeMarket} variant="outline" className="mt-4">
            Try Again
          </Button>
        </div>
      )}

      {/* AI Recommendation */}
      {recommendation && !isAnalyzing && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-panel p-6 gradient-border">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/20">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Best Opportunity</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-primary">{recommendation.symbol}</span>
                    <span className="text-muted-foreground">({recommendation.name})</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">
                  ${recommendation.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </p>
                <p className={cn(
                  'text-sm font-medium',
                  recommendation.change24h >= 0 ? 'text-profit' : 'text-loss'
                )}>
                  {recommendation.change24h >= 0 ? '+' : ''}{recommendation.change24h?.toFixed(2)}%
                </p>
              </div>
            </div>

            {/* Strategy Badge */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="px-4 py-2 rounded-full bg-primary/20 text-primary font-medium flex items-center gap-2">
                <Zap className="w-4 h-4" />
                {recommendation.strategy}
              </span>
              <span className="px-3 py-1 rounded-full bg-secondary text-foreground text-sm">
                {recommendation.timeframe} timeframe
              </span>
              <span className={cn(
                'px-3 py-1 rounded-full text-xs font-medium',
                recommendation.riskLevel === 'low' && 'bg-success/20 text-success',
                recommendation.riskLevel === 'medium' && 'bg-warning/20 text-warning',
                recommendation.riskLevel === 'high' && 'bg-destructive/20 text-destructive',
              )}>
                {recommendation.riskLevel.toUpperCase()} RISK
              </span>
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
                <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                <p className="text-lg font-bold text-primary">{recommendation.confidence}%</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Position Size</p>
                <p className="text-lg font-bold text-foreground">{recommendation.positionSize}%</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Stop Loss</p>
                <p className="text-lg font-bold text-destructive">-{recommendation.stopLoss}%</p>
              </div>
              <div className="p-4 rounded-lg bg-secondary/30">
                <p className="text-xs text-muted-foreground mb-1">Take Profit</p>
                <p className="text-lg font-bold text-success">+{recommendation.takeProfit}%</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Signals */}
            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Key Signals</h3>
              <div className="space-y-3">
                {recommendation.signals?.map((signal, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    {signal.type === 'bullish' ? (
                      <TrendingUp className="w-4 h-4 text-success" />
                    ) : signal.type === 'bearish' ? (
                      <TrendingDown className="w-4 h-4 text-destructive" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-muted-foreground">{signal.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Parameters */}
            <div className="glass-panel p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Risk/Reward</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span className="text-sm text-muted-foreground">R:R Ratio</span>
                  <span className="font-mono font-medium text-foreground">
                    1:{(recommendation.takeProfit / recommendation.stopLoss).toFixed(1)}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <span className="text-sm text-muted-foreground">Max Loss</span>
                  <span className="font-mono font-medium text-destructive">
                    {recommendation.positionSize * recommendation.stopLoss / 100}% of capital
                  </span>
                </div>
              </div>
            </div>

            {/* Alternatives */}
            {alternativeAssets.length > 0 && (
              <div className="glass-panel p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Runner-ups</h3>
                <div className="flex flex-wrap gap-2">
                  {alternativeAssets.map((symbol) => {
                    const asset = allAssets.find(a => a.symbol === symbol);
                    return (
                      <div key={symbol} className="px-3 py-2 rounded-lg bg-secondary/50 text-sm">
                        <span className="font-medium text-foreground">{symbol}</span>
                        {asset && (
                          <span className={cn(
                            'ml-2',
                            asset.change24h >= 0 ? 'text-profit' : 'text-loss'
                          )}>
                            {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* All Assets Overview */}
      {allAssets.length > 0 && !isAnalyzing && (
        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">All Analyzed Assets</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {allAssets.map((asset) => (
              <div 
                key={asset.symbol} 
                className={cn(
                  'p-3 rounded-lg bg-secondary/30 transition-all',
                  asset.symbol === recommendation?.symbol && 'ring-2 ring-primary'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-foreground">{asset.symbol}</span>
                  {asset.symbol === recommendation?.symbol && (
                    <Target className="w-3 h-3 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">${asset.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                <p className={cn(
                  'text-xs font-medium',
                  asset.change24h >= 0 ? 'text-profit' : 'text-loss'
                )}>
                  {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

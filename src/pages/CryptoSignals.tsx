import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Fish, 
  MessageSquare, 
  Zap, 
  Users, 
  TrendingUp,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Shield,
  AlertTriangle,
  Loader2,
  ExternalLink,
  UserPlus,
  UserMinus,
  Timer,
  Check,
  Activity,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { FeatureGate } from '@/components/subscription/UpgradePrompt';
import { useFollowedTraders } from '@/hooks/useFollowedTraders';
import { useCopyTradeSignals } from '@/hooks/useCopyTradeSignals';
import { LiquidationMapCard } from '@/components/trading/LiquidationMapCard';
import { PolymarketSignalsCard } from '@/components/trading/PolymarketSignalsCard';
import { NewsFeedCard } from '@/components/trading/NewsFeedCard';

const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

export default function CryptoSignals() {
  const queryClient = useQueryClient();
  const [isScanning, setIsScanning] = useState(false);
  const [activeTab, setActiveTab] = useState('whale');
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [nextScanIn, setNextScanIn] = useState(AUTO_REFRESH_INTERVAL / 1000);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  
  const { 
    followedTraders, 
    followTrader, 
    unfollowTrader, 
    isFollowing,
    isFollowingLoading,
    isUnfollowingLoading 
  } = useFollowedTraders();

  const { 
    signals: copyTradeSignals, 
    isLoading: loadingSignals,
    executeCopyTrades 
  } = useCopyTradeSignals();

  // Fetch whale signals
  const { data: whaleSignals, isLoading: loadingWhale } = useQuery({
    queryKey: ['whale-signals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whale_signals')
        .select('*')
        .order('detected_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Fetch sentiment signals
  const { data: sentimentSignals, isLoading: loadingSentiment } = useQuery({
    queryKey: ['sentiment-signals'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sentiment_signals')
        .select('*')
        .order('analyzed_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Fetch MEV opportunities
  const { data: mevOpportunities, isLoading: loadingMev } = useQuery({
    queryKey: ['mev-opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mev_opportunities')
        .select('*')
        .gte('expires_at', new Date().toISOString())
        .order('net_profit_usd', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  // Fetch top traders
  const { data: topTraders, isLoading: loadingTraders } = useQuery({
    queryKey: ['top-traders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('top_traders')
        .select('*')
        .order('win_rate', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  // Fetch DeFi yields
  const { data: defiYields, isLoading: loadingDefi } = useQuery({
    queryKey: ['defi-yields'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('defi_yields')
        .select('*')
        .order('total_apy', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });

  const runScan = useCallback(async (silent = false) => {
    if (isScanning) return;
    setIsScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('crypto-signals-scanner', {
        body: { scanType: 'all' }
      });
      
      if (error) throw error;
      
      setLastScanTime(new Date());
      setNextScanIn(AUTO_REFRESH_INTERVAL / 1000);
      
      if (!silent) {
        toast.success('Signals scan complete', {
          description: `Found ${Object.values(data.results || {}).reduce((a: number, b: any) => a + (b || 0), 0)} new signals`
        });
      }
      
      // Refresh all queries
      queryClient.invalidateQueries({ queryKey: ['whale-signals'] });
      queryClient.invalidateQueries({ queryKey: ['sentiment-signals'] });
      queryClient.invalidateQueries({ queryKey: ['mev-opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['top-traders'] });
      queryClient.invalidateQueries({ queryKey: ['defi-yields'] });
    } catch (error) {
      console.error('Scan error:', error);
      if (!silent) {
        toast.error('Failed to scan signals');
      }
    } finally {
      setIsScanning(false);
    }
  }, [isScanning, queryClient]);

  const handleScan = () => runScan(false);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefreshEnabled) return;

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setNextScanIn(prev => {
        if (prev <= 1) {
          return AUTO_REFRESH_INTERVAL / 1000;
        }
        return prev - 1;
      });
    }, 1000);

    // Auto-scan interval
    const scanInterval = setInterval(() => {
      runScan(true);
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(scanInterval);
    };
  }, [autoRefreshEnabled, runScan]);

  // Group sentiment by symbol
  const sentimentBySymbol = sentimentSignals?.reduce((acc: any, signal: any) => {
    if (!acc[signal.symbol]) {
      acc[signal.symbol] = { symbol: signal.symbol, sources: [], avgSentiment: 0, totalMentions: 0 };
    }
    acc[signal.symbol].sources.push(signal);
    acc[signal.symbol].totalMentions += signal.mention_count;
    return acc;
  }, {});

  if (sentimentBySymbol) {
    Object.values(sentimentBySymbol).forEach((item: any) => {
      item.avgSentiment = item.sources.reduce((a: number, b: any) => a + b.sentiment_score, 0) / item.sources.length;
    });
  }

  return (
    <FeatureGate feature="moonshot_scanner">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Crypto Signals</h1>
            <p className="text-muted-foreground">
              Real-time whale tracking, sentiment analysis, MEV opportunities, and more
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Auto-refresh status */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border/50">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-6 w-6 p-0 ${autoRefreshEnabled ? 'text-green-400' : 'text-muted-foreground'}`}
                    onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                  >
                    <Timer className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {autoRefreshEnabled ? 'Disable auto-refresh' : 'Enable auto-refresh'}
                </TooltipContent>
              </Tooltip>
              <div className="text-xs">
                {autoRefreshEnabled ? (
                  <span className="text-muted-foreground">
                    Next scan in <span className="font-mono text-foreground">{Math.floor(nextScanIn / 60)}:{String(nextScanIn % 60).padStart(2, '0')}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Auto-refresh off</span>
                )}
              </div>
              {lastScanTime && (
                <Badge variant="outline" className="text-xs">
                  Last: {formatDistanceToNow(lastScanTime, { addSuffix: true })}
                </Badge>
              )}
            </div>
            <Button 
              onClick={handleScan} 
              disabled={isScanning}
              variant="glow"
            >
              {isScanning ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Scan Now
            </Button>
          </div>
        </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/20">
                    <Fish className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{whaleSignals?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Whale Moves</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <MessageSquare className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{Object.keys(sentimentBySymbol || {}).length}</p>
                    <p className="text-xs text-muted-foreground">Trending</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/20">
                    <Zap className="w-5 h-5 text-yellow-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{mevOpportunities?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">MEV Opps</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/20">
                    <Users className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{topTraders?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">Top Traders</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{defiYields?.length || 0}</p>
                    <p className="text-xs text-muted-foreground">DeFi Yields</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="whale" className="gap-2">
                <Fish className="w-4 h-4" /> Whale Tracking
              </TabsTrigger>
              <TabsTrigger value="sentiment" className="gap-2">
                <MessageSquare className="w-4 h-4" /> Sentiment
              </TabsTrigger>
              <TabsTrigger value="mev" className="gap-2">
                <Zap className="w-4 h-4" /> MEV
              </TabsTrigger>
              <TabsTrigger value="copy" className="gap-2">
                <Users className="w-4 h-4" /> Copy Trading
              </TabsTrigger>
              <TabsTrigger value="defi" className="gap-2">
                <TrendingUp className="w-4 h-4" /> DeFi Yields
              </TabsTrigger>
              <TabsTrigger value="liqmap" className="gap-2">
                <TrendingUp className="w-4 h-4" /> Liquidation Map
              </TabsTrigger>
              <TabsTrigger value="polymarket" className="gap-2">
                <TrendingUp className="w-4 h-4" /> Polymarket
              </TabsTrigger>
              <TabsTrigger value="news" className="gap-2">
                <MessageSquare className="w-4 h-4" /> News
              </TabsTrigger>
            </TabsList>

            {/* Whale Tracking Tab */}
            <TabsContent value="whale">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Fish className="w-5 h-5 text-blue-400" />
                    Whale Movements
                  </CardTitle>
                  <CardDescription>
                    Track large wallet transactions and whale accumulation/distribution patterns
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {loadingWhale ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : whaleSignals?.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        No whale signals detected. Click "Scan Now" to find whale movements.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {whaleSignals?.map((signal: any) => (
                          <div 
                            key={signal.id} 
                            className="p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-blue-500/50 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <Badge variant={signal.action === 'accumulation' ? 'default' : signal.action === 'distribution' ? 'destructive' : 'secondary'}>
                                  {signal.action}
                                </Badge>
                                <span className="font-bold text-lg">{signal.symbol}</span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(signal.detected_at), { addSuffix: true })}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Amount</p>
                                <p className="font-medium">{signal.amount?.toLocaleString()} {signal.symbol}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Value</p>
                                <p className="font-medium text-green-400">${signal.amount_usd?.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Flow</p>
                                <p className="font-medium">
                                  {signal.from_exchange && 'From Exchange'}
                                  {signal.to_exchange && 'To Exchange'}
                                  {!signal.from_exchange && !signal.to_exchange && 'Wallet to Wallet'}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Confidence</p>
                                <div className="flex items-center gap-2">
                                  <Progress value={signal.confidence} className="h-2 flex-1" />
                                  <span className="font-medium">{signal.confidence?.toFixed(0)}%</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Sentiment Tab */}
            <TabsContent value="sentiment">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-purple-400" />
                    Social Sentiment
                  </CardTitle>
                  <CardDescription>
                    Aggregated sentiment from Twitter, Reddit, Telegram, and Discord
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {loadingSentiment ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : !sentimentBySymbol || Object.keys(sentimentBySymbol).length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        No sentiment data. Click "Scan Now" to analyze social sentiment.
                      </div>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-4">
                        {Object.values(sentimentBySymbol)
                          .sort((a: any, b: any) => b.totalMentions - a.totalMentions)
                          .map((item: any) => (
                            <div 
                              key={item.symbol} 
                              className="p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-purple-500/50 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <span className="font-bold text-lg">{item.symbol}</span>
                                <div className="flex items-center gap-2">
                                  {item.avgSentiment > 0.2 ? (
                                    <ArrowUpRight className="w-5 h-5 text-green-400" />
                                  ) : item.avgSentiment < -0.2 ? (
                                    <ArrowDownRight className="w-5 h-5 text-red-400" />
                                  ) : (
                                    <span className="w-5 h-5 text-yellow-400">—</span>
                                  )}
                                  <Badge variant={item.avgSentiment > 0.2 ? 'default' : item.avgSentiment < -0.2 ? 'destructive' : 'secondary'}>
                                    {item.avgSentiment > 0 ? '+' : ''}{(item.avgSentiment * 100).toFixed(0)}%
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                                <span>{item.totalMentions.toLocaleString()} mentions</span>
                                <span>{item.sources.length} sources</span>
                              </div>
                              <div className="flex gap-2">
                                {item.sources.map((source: any) => (
                                  <Badge key={source.source} variant="outline" className="text-xs">
                                    {source.source}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* MEV Tab */}
            <TabsContent value="mev">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-400" />
                    MEV Opportunities
                  </CardTitle>
                  <CardDescription>
                    Arbitrage, liquidation, and other MEV opportunities (time-sensitive)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {loadingMev ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : mevOpportunities?.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        No active MEV opportunities. Click "Scan Now" to find opportunities.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {mevOpportunities?.map((opp: any) => (
                          <div 
                            key={opp.id} 
                            className="p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-yellow-500/50 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">
                                  {opp.opportunity_type}
                                </Badge>
                                <span className="font-bold">{opp.symbol}</span>
                                <Badge variant="secondary">{opp.chain}</Badge>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="w-4 h-4" />
                                Expires {formatDistanceToNow(new Date(opp.expires_at), { addSuffix: true })}
                              </div>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Est. Profit</p>
                                <p className="font-medium text-green-400">${opp.estimated_profit_usd?.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Gas Cost</p>
                                <p className="font-medium text-red-400">${opp.gas_cost_usd?.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Net Profit</p>
                                <p className="font-medium text-primary">${opp.net_profit_usd?.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Risk</p>
                                <Badge variant={opp.risk_level === 'low' ? 'default' : opp.risk_level === 'high' ? 'destructive' : 'secondary'}>
                                  {opp.risk_level}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Copy Trading Tab */}
            <TabsContent value="copy">
              <div className="space-y-6">
                {/* Followed Traders Section */}
                {followedTraders && followedTraders.length > 0 && (
                  <Card className="bg-card/50 border-green-500/30">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Check className="w-5 h-5 text-green-400" />
                        Following ({followedTraders.length})
                      </CardTitle>
                      <CardDescription>
                        The AI will mirror positions from these traders based on their signals
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {topTraders?.filter((t: any) => isFollowing(t.id)).map((trader: any) => (
                          <div 
                            key={trader.id}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30"
                          >
                            <span className="font-medium text-sm">{trader.display_name}</span>
                            <Badge variant="outline" className="text-xs border-green-500/50 text-green-400">
                              {trader.win_rate?.toFixed(0)}% WR
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400"
                              onClick={() => unfollowTrader(trader.id)}
                              disabled={isUnfollowingLoading}
                            >
                              <UserMinus className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Real-time Copy Trade Signals */}
                <Card className="bg-card/50 border-primary/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Activity className="w-5 h-5 text-primary animate-pulse" />
                          Live Trading Signals
                        </CardTitle>
                        <CardDescription>
                          Real-time trades from followed traders - AI mirrors these automatically
                        </CardDescription>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={async () => {
                          try {
                            await executeCopyTrades();
                            toast.success('Copy trades executed');
                          } catch {
                            toast.error('Failed to execute copy trades');
                          }
                        }}
                      >
                        <Copy className="w-4 h-4" /> Execute Now
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {loadingSignals ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : !followedTraders || followedTraders.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Follow traders above to see their real-time signals
                      </div>
                    ) : copyTradeSignals.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No recent signals from followed traders. Signals appear when they trade.
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px]">
                        <div className="space-y-2">
                          {copyTradeSignals.map((signal: any) => (
                            <div
                              key={signal.id}
                              className={`p-3 rounded-lg border transition-all ${
                                signal.status === 'pending'
                                  ? 'bg-yellow-500/5 border-yellow-500/30 animate-pulse'
                                  : signal.status === 'copied'
                                  ? 'bg-green-500/5 border-green-500/30'
                                  : 'bg-muted/30 border-border/50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${
                                    signal.action === 'buy' 
                                      ? 'bg-green-500/20' 
                                      : 'bg-red-500/20'
                                  }`}>
                                    {signal.action === 'buy' ? (
                                      <ArrowUpRight className="w-4 h-4 text-green-400" />
                                    ) : (
                                      <ArrowDownRight className="w-4 h-4 text-red-400" />
                                    )}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold">{signal.symbol}</span>
                                      <Badge 
                                        variant={signal.action === 'buy' ? 'default' : 'destructive'}
                                        className="text-xs"
                                      >
                                        {signal.action.toUpperCase()}
                                      </Badge>
                                      <Badge 
                                        variant={signal.status === 'pending' ? 'outline' : 'secondary'}
                                        className={`text-xs ${
                                          signal.status === 'pending' 
                                            ? 'border-yellow-500/50 text-yellow-400' 
                                            : signal.status === 'copied'
                                            ? 'border-green-500/50 text-green-400'
                                            : ''
                                        }`}
                                      >
                                        {signal.status}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      by {signal.trader?.display_name || 'Unknown'} • {signal.trader?.win_rate?.toFixed(0)}% WR
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="font-medium">${signal.entry_price?.toFixed(2)}</p>
                                  <p className="text-xs text-muted-foreground">
                                    ${signal.trade_value_usd?.toFixed(0)} value
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                                <span>{formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}</span>
                                {signal.copied_at && (
                                  <span className="text-green-400">
                                    ✓ Copied {formatDistanceToNow(new Date(signal.copied_at), { addSuffix: true })}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>

                {/* All Traders */}
                <Card className="bg-card/50 border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-green-400" />
                      Top Traders
                    </CardTitle>
                    <CardDescription>
                      Track and copy successful traders with proven track records
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px]">
                      {loadingTraders ? (
                        <div className="flex items-center justify-center py-12">
                          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                      ) : topTraders?.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                          No traders found. Click "Scan Now" to discover top traders.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {topTraders?.map((trader: any, idx: number) => {
                            const following = isFollowing(trader.id);
                            return (
                              <div 
                                key={trader.id} 
                                className={`p-4 rounded-lg border transition-colors ${
                                  following 
                                    ? 'bg-green-500/5 border-green-500/30 hover:border-green-500/50' 
                                    : 'bg-muted/30 border-border/50 hover:border-green-500/50'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                                      following 
                                        ? 'bg-gradient-to-br from-green-500 to-green-600' 
                                        : 'bg-gradient-to-br from-primary to-primary/50'
                                    }`}>
                                      #{idx + 1}
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <p className="font-bold">{trader.display_name}</p>
                                        {following && (
                                          <Badge variant="outline" className="text-xs border-green-500/50 text-green-400">
                                            Following
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground font-mono">
                                        {trader.wallet_address?.slice(0, 6)}...{trader.wallet_address?.slice(-4)}
                                      </p>
                                    </div>
                                  </div>
                                  {following ? (
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="gap-2 border-red-500/50 text-red-400 hover:bg-red-500/10"
                                      onClick={() => unfollowTrader(trader.id)}
                                      disabled={isUnfollowingLoading}
                                    >
                                      <UserMinus className="w-4 h-4" /> Unfollow
                                    </Button>
                                  ) : (
                                    <Button 
                                      size="sm" 
                                      variant="outline" 
                                      className="gap-2 border-green-500/50 text-green-400 hover:bg-green-500/10"
                                      onClick={() => followTrader({ traderId: trader.id })}
                                      disabled={isFollowingLoading}
                                    >
                                      <UserPlus className="w-4 h-4" /> Follow
                                    </Button>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                                  <div>
                                    <p className="text-muted-foreground">Win Rate</p>
                                    <p className="font-medium text-green-400">{trader.win_rate?.toFixed(1)}%</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Total P&L</p>
                                    <p className={`font-medium ${trader.total_pnl_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      ${trader.total_pnl_usd?.toLocaleString()}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Trades</p>
                                    <p className="font-medium">{trader.total_trades}</p>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Style</p>
                                    <Badge variant="outline">{trader.trading_style}</Badge>
                                  </div>
                                  <div>
                                    <p className="text-muted-foreground">Followers</p>
                                    <p className="font-medium">{trader.followers_count?.toLocaleString()}</p>
                                  </div>
                                </div>
                                {trader.best_performing_assets?.length > 0 && (
                                  <div className="mt-3 flex gap-2">
                                    <span className="text-xs text-muted-foreground">Best at:</span>
                                    {trader.best_performing_assets.slice(0, 5).map((asset: string) => (
                                      <Badge key={asset} variant="secondary" className="text-xs">{asset}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* DeFi Yields Tab */}
            <TabsContent value="defi">
              <Card className="bg-card/50 border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                    DeFi Yield Opportunities
                  </CardTitle>
                  <CardDescription>
                    Best yield farming opportunities across DeFi protocols
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    {loadingDefi ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : defiYields?.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        No yield opportunities found. Click "Scan Now" to discover yields.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {defiYields?.map((yield_: any) => (
                          <div 
                            key={yield_.id} 
                            className="p-4 rounded-lg bg-muted/30 border border-border/50 hover:border-emerald-500/50 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <span className="font-bold">{yield_.protocol}</span>
                                <Badge variant="secondary">{yield_.chain}</Badge>
                                {yield_.audited && (
                                  <Badge variant="outline" className="border-green-500/50 text-green-400 gap-1">
                                    <Shield className="w-3 h-3" /> Audited
                                  </Badge>
                                )}
                              </div>
                              {yield_.url && (
                                <Button size="sm" variant="ghost" asChild>
                                  <a href={yield_.url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4" />
                                  </a>
                                </Button>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">{yield_.pool_name}</p>
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                              <div>
                                <p className="text-muted-foreground">Total APY</p>
                                <p className="font-bold text-2xl text-emerald-400">{yield_.total_apy?.toFixed(2)}%</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Base APY</p>
                                <p className="font-medium">{yield_.apy?.toFixed(2)}%</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Rewards</p>
                                <p className="font-medium">
                                  {yield_.rewards_apy > 0 ? `${yield_.rewards_apy?.toFixed(2)}% ${yield_.rewards_token}` : '—'}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">TVL</p>
                                <p className="font-medium">${(yield_.tvl_usd / 1000000)?.toFixed(1)}M</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Risk</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant={yield_.risk_level === 'low' ? 'default' : yield_.risk_level === 'high' ? 'destructive' : 'secondary'}>
                                    {yield_.risk_level}
                                  </Badge>
                                  {yield_.impermanent_loss_risk && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                                      </TooltipTrigger>
                                      <TooltipContent>Impermanent loss risk</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="liqmap">
              <LiquidationMapCard limit={20} />
            </TabsContent>

            <TabsContent value="polymarket">
              <PolymarketSignalsCard />
            </TabsContent>
          </Tabs>
        </div>
    </FeatureGate>
  );
}

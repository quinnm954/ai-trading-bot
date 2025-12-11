import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Rocket, TrendingUp, RefreshCw, Info, Zap, Target, Activity, Users, BarChart3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MoonshotSignal {
  id: string;
  symbol: string;
  name: string;
  pump_probability: number;
  volume_score: number;
  liquidity_score: number;
  sentiment_score: number;
  whale_score: number;
  technical_score: number;
  price_usd: number;
  volume_24h: number;
  price_change_24h: number;
  signal_tags: string[];
  updated_at: string;
}

function getProbabilityColor(probability: number): string {
  if (probability >= 70) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (probability >= 50) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  return 'bg-red-500/20 text-red-400 border-red-500/30';
}

function formatNumber(num: number, decimals = 2): string {
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(decimals)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(decimals)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(decimals)}K`;
  return `$${num.toFixed(decimals)}`;
}

function formatPrice(price: number): string {
  if (price < 0.0001) return `$${price.toFixed(8)}`;
  if (price < 0.01) return `$${price.toFixed(6)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

function ScoreBar({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <span className="font-medium">{score}%</span>
      </div>
      <Progress value={score} className="h-2" />
    </div>
  );
}

function SignalDetailModal({ signal }: { signal: MoonshotSignal }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Info className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            {signal.symbol} - {signal.name}
          </DialogTitle>
          <DialogDescription>
            Pump Probability Analysis
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Main Score */}
          <div className="text-center p-4 rounded-lg bg-muted/50">
            <div className="text-4xl font-bold text-primary">{signal.pump_probability}%</div>
            <div className="text-sm text-muted-foreground mt-1">Pump Probability Score</div>
          </div>

          {/* Score Breakdown */}
          <div className="space-y-3">
            <ScoreBar label="Volume Activity" score={signal.volume_score} icon={Activity} />
            <ScoreBar label="Liquidity" score={signal.liquidity_score} icon={BarChart3} />
            <ScoreBar label="Social Sentiment" score={signal.sentiment_score} icon={Users} />
            <ScoreBar label="Whale Activity" score={signal.whale_score} icon={Target} />
            <ScoreBar label="Technical Signals" score={signal.technical_score} icon={TrendingUp} />
          </div>

          {/* Tags */}
          {signal.signal_tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {signal.signal_tags.map((tag, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground text-center italic">
            This score estimates the likelihood of a strong price move. It does NOT guarantee a pump.
            Always do your own research before trading.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MoonshotScanner() {
  const [signals, setSignals] = useState<MoonshotSignal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [prioritizeMoonshots, setPrioritizeMoonshots] = useState(false);
  const { toast } = useToast();

  const fetchSignals = async () => {
    try {
      const { data, error } = await supabase
        .from('moonshot_signals')
        .select('*')
        .order('pump_probability', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSignals((data as MoonshotSignal[]) || []);
    } catch (error) {
      console.error('Error fetching signals:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch moonshot signals',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('ai_settings')
        .select('prioritize_moonshots')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setPrioritizeMoonshots(data.prioritize_moonshots || false);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const runScanner = async () => {
    setIsScanning(true);
    try {
      const { error } = await supabase.functions.invoke('moonshot-scanner', {
        method: 'POST',
      });

      if (error) throw error;

      toast({
        title: 'Scanner Complete',
        description: 'Moonshot signals have been updated',
      });

      await fetchSignals();
    } catch (error) {
      console.error('Error running scanner:', error);
      toast({
        title: 'Scanner Error',
        description: 'Failed to run moonshot scanner',
        variant: 'destructive',
      });
    } finally {
      setIsScanning(false);
    }
  };

  const togglePrioritizeMoonshots = async (enabled: boolean) => {
    setPrioritizeMoonshots(enabled);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('ai_settings')
        .update({ prioritize_moonshots: enabled })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: enabled ? 'Moonshot Priority Enabled' : 'Moonshot Priority Disabled',
        description: enabled 
          ? 'AI will prioritize coins with high pump probability' 
          : 'AI will use standard trading criteria',
      });
    } catch (error) {
      console.error('Error updating settings:', error);
      setPrioritizeMoonshots(!enabled);
    }
  };

  useEffect(() => {
    fetchSignals();
    fetchSettings();

    // Set up realtime subscription
    const channel = supabase
      .channel('moonshot-signals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'moonshot_signals' },
        () => fetchSignals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Rocket className="h-8 w-8 text-primary" />
            Moonshot Scanner
          </h1>
          <p className="text-muted-foreground mt-1">
            Detect early signals of coins that may skyrocket
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="prioritize-moonshots"
              checked={prioritizeMoonshots}
              onCheckedChange={togglePrioritizeMoonshots}
            />
            <Label htmlFor="prioritize-moonshots" className="text-sm">
              Prioritize in AI Trading
            </Label>
          </div>
          
          <Button onClick={runScanner} disabled={isScanning}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">High Probability</p>
                <p className="text-2xl font-bold text-green-400">
                  {signals.filter(s => s.pump_probability >= 70).length}
                </p>
              </div>
              <Zap className="h-8 w-8 text-green-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Medium Probability</p>
                <p className="text-2xl font-bold text-yellow-400">
                  {signals.filter(s => s.pump_probability >= 50 && s.pump_probability < 70).length}
                </p>
              </div>
              <Target className="h-8 w-8 text-yellow-400 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Scanned</p>
                <p className="text-2xl font-bold">{signals.length}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Signals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Top Moonshot Candidates</CardTitle>
          <CardDescription>
            Coins ranked by pump probability score (updated every 5-10 minutes)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : signals.length === 0 ? (
            <div className="text-center py-12">
              <Rocket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No signals yet. Click "Scan Now" to start.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Coin</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Pump Score</th>
                    <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Price</th>
                    <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">24h Change</th>
                    <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">24h Volume</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Signals</th>
                    <th className="text-center py-3 px-2 text-sm font-medium text-muted-foreground">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((signal) => (
                    <tr key={signal.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-4 px-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-xs font-bold">{signal.symbol.slice(0, 2)}</span>
                          </div>
                          <div>
                            <p className="font-medium">{signal.symbol}</p>
                            <p className="text-xs text-muted-foreground">{signal.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-2 text-center">
                        <Badge className={`${getProbabilityColor(signal.pump_probability)} font-bold`}>
                          {signal.pump_probability}%
                        </Badge>
                      </td>
                      <td className="py-4 px-2 text-right font-mono">
                        {formatPrice(signal.price_usd)}
                      </td>
                      <td className={`py-4 px-2 text-right font-medium ${signal.price_change_24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {signal.price_change_24h >= 0 ? '+' : ''}{signal.price_change_24h?.toFixed(2)}%
                      </td>
                      <td className="py-4 px-2 text-right text-muted-foreground">
                        {formatNumber(signal.volume_24h)}
                      </td>
                      <td className="py-4 px-2">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {signal.signal_tags?.slice(0, 2).map((tag, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs whitespace-nowrap">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-2 text-center">
                        <SignalDetailModal signal={signal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Disclaimer:</strong> The Moonshot Scanner provides algorithmic analysis based on market data patterns.
            High pump probability does NOT guarantee price increases. Always conduct your own research and never invest more than you can afford to lose.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

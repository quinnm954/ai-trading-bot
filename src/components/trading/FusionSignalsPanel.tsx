import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Loader2, Brain, TrendingUp, TrendingDown, Minus, Sparkles, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTitanFusion } from '@/hooks/useTitanFusion';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';

const directionMeta = {
  bullish: { Icon: TrendingUp, color: 'text-success', variant: 'default' as const },
  bearish: { Icon: TrendingDown, color: 'text-destructive', variant: 'destructive' as const },
  neutral: { Icon: Minus, color: 'text-muted-foreground', variant: 'secondary' as const },
};

export function FusionSignalsPanel() {
  const { data: signals, isLoading, refetch, isFetching } = useTitanFusion();
  const [running, setRunning] = useState(false);

  const runFusion = async () => {
    setRunning(true);
    try {
      const { error } = await supabase.functions.invoke('titan-fusion-engine');
      if (error) throw error;
      toast.success('Fusion analysis complete');
      await refetch();
    } catch (e: any) {
      toast.error(e?.message ?? 'Fusion run failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            Titan AI Fusion
            <Sparkles className="w-4 h-4 text-primary/60" />
          </CardTitle>
          <CardDescription>
            Unified conviction per asset — blends Coinbase candles, technicals, and volume.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
          </Button>
          <Button size="sm" onClick={runFusion} disabled={running}>
            {running ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Sparkles className="w-4 h-4 mr-2" />}
            Run Fusion Now
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading fusion signals…
          </div>
        )}

        {!isLoading && (!signals || signals.length === 0) && (
          <div className="text-sm text-muted-foreground py-8 text-center space-y-2">
            <p>No fusion signals generated yet.</p>
            <p className="text-xs">Click "Run Fusion Now" to generate the first batch.</p>
          </div>
        )}

        {!isLoading && signals && signals.length > 0 && (
          <ScrollArea className="h-[600px] pr-3">
            <TooltipProvider>
              <div className="space-y-3">
                {signals.map((s) => {
                  const meta = directionMeta[s.direction];
                  return (
                    <div key={s.id} className="rounded-lg border bg-card/50 p-4 hover:bg-accent/20 transition-colors">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-bold">{s.symbol}</span>
                          <Badge variant={meta.variant} className="gap-1">
                            <meta.Icon className="w-3 h-3" /> {s.direction}
                          </Badge>
                          <Badge variant="outline">{s.horizon}</Badge>
                        </div>
                        <div className="text-right">
                          <div className={`text-2xl font-bold ${meta.color}`}>{s.conviction}</div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Conviction</div>
                        </div>
                      </div>

                      <Progress value={s.conviction} className="h-2 mb-3" />

                      {s.drivers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {s.drivers.map((d, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{d}</Badge>
                          ))}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                        <div className="flex-1">{s.rationale}</div>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button className="text-muted-foreground hover:text-foreground shrink-0">
                              <Info className="w-3.5 h-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">
                            <pre className="text-[10px] whitespace-pre-wrap">{JSON.stringify(s.features, null, 2)}</pre>
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      <div className="text-[10px] text-muted-foreground mt-2">
                        Updated {formatDistanceToNow(new Date(s.generated_at), { addSuffix: true })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TooltipProvider>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

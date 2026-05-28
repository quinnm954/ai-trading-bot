import { FusionSignalsPanel } from '@/components/trading/FusionSignalsPanel';
import { NewsFeedCard } from '@/components/trading/NewsFeedCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Brain, Layers, Zap, Newspaper, Activity, CandlestickChart } from 'lucide-react';

export default function Fusion() {
  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Brain className="w-8 h-8 text-primary" />
          Titan AI Fusion
        </h1>
        <p className="text-muted-foreground mt-1">
          Multi-source market intelligence. Each conviction score blends every signal layer below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Signal Stack</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
            <div className="rounded-md border p-2 flex items-center gap-2">
              <CandlestickChart className="w-4 h-4 text-primary" /> Coinbase candles
            </div>
            <div className="rounded-md border p-2 flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-primary" /> News sentiment
            </div>
            <div className="rounded-md border p-2 flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Liquidation map
            </div>
            <div className="rounded-md border p-2 flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Technicals + regime
            </div>
            <div className="rounded-md border p-2 flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Volume analysis
            </div>
            <div className="rounded-md border p-2 flex items-center gap-2">
              <Brain className="w-4 h-4 text-primary" /> AI conviction
            </div>
          </div>
        </CardContent>
      </Card>

      <FusionSignalsPanel />

      <NewsFeedCard />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useEquityHistory } from '@/hooks/useEquityHistory';

type Period = '1D' | '1W' | '1M' | '3M' | 'ALL';

const periodDays: Record<Period, number> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  'ALL': 365,
};

export function EquityChart() {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('1M');
  const { equityHistory, isLoading } = useEquityHistory(periodDays[selectedPeriod]);

  const chartData = useMemo(() => {
    return equityHistory.map(point => ({
      date: point.recordedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      equity: point.equity,
    }));
  }, [equityHistory]);

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Equity Curve</h3>
          <p className="text-sm text-muted-foreground">
            {selectedPeriod === 'ALL' ? 'All time' : `${periodDays[selectedPeriod]}-day`} performance
          </p>
        </div>
        <div className="flex gap-2">
          {(['1D', '1W', '1M', '3M', 'ALL'] as Period[]).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                period === selectedPeriod 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      
      <div className="h-[300px]">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Loading chart...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            No equity data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                domain={['dataMin - 1000', 'dataMax + 1000']}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  color: 'hsl(var(--foreground))',
                }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Equity']}
              />
              <Area
                type="monotone"
                dataKey="equity"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#equityGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

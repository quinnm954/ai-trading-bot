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
    <div className="glass-panel p-4 sm:p-6">
      <div className="flex flex-col gap-3 mb-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-foreground whitespace-nowrap">Equity Curve</h3>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {selectedPeriod === 'ALL' ? 'All time' : `${periodDays[selectedPeriod]}-day`} performance
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2 sm:flex sm:flex-wrap">
          {(['1D', '1W', '1M', '3M', 'ALL'] as Period[]).map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              aria-pressed={period === selectedPeriod}
              className={`min-h-9 px-2 sm:px-3 text-xs font-medium rounded-md transition-colors touch-manipulation ${
                period === selectedPeriod 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-secondary text-muted-foreground hover:text-foreground active:bg-secondary/70'
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>
      
      <div className="h-[220px] sm:h-[300px] -mx-2 sm:mx-0">

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

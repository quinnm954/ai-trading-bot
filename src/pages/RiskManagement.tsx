import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, 
  AlertTriangle, 
  TrendingDown, 
  Activity,
  RefreshCw,
  Calendar,
  Clock,
  ChevronDown,
  ChevronUp,
  Filter
} from 'lucide-react';
import { RiskStatusCard } from '@/components/risk/RiskStatusCard';
import { RiskSettingsPanel } from '@/components/risk/RiskSettingsPanel';
import { ScalpingReplayPanel } from '@/components/risk/ScalpingReplayPanel';
import { useRiskManager, RiskEvent } from '@/hooks/useRiskManager';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

export default function RiskManagement() {
  const { user } = useAuth();
  const { riskStatus, isLoading, fetchRiskStatus } = useRiskManager();
  const [allEvents, setAllEvents] = useState<RiskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [drawdownHistory, setDrawdownHistory] = useState<{ date: string; drawdown: number; equity: number }[]>([]);

  // Fetch all risk events
  useEffect(() => {
    if (!user) return;

    const fetchAllEvents = async () => {
      setEventsLoading(true);
      const { data, error } = await supabase
        .from('risk_events')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: sortOrder === 'asc' })
        .limit(100);

      if (!error && data) {
        setAllEvents(data.map(e => ({
          id: e.id,
          event_type: e.event_type,
          severity: e.severity as 'info' | 'warning' | 'critical',
          message: e.message,
          details: e.details,
          created_at: e.created_at || '',
        })));
      }
      setEventsLoading(false);
    };

    fetchAllEvents();

    // Real-time updates
    const channel = supabase
      .channel(`risk-events-full-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'risk_events',
          filter: `user_id=eq.${user.id}`,
        },
        () => fetchAllEvents()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, sortOrder]);

  // Fetch drawdown history from equity_history
  useEffect(() => {
    if (!user || !riskStatus) return;

    const fetchDrawdownHistory = async () => {
      const { data } = await supabase
        .from('equity_history')
        .select('equity, recorded_at')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true })
        .limit(50);

      if (data && data.length > 0) {
        let peakEquity = data[0].equity;
        const history = data.map(point => {
          if (point.equity > peakEquity) peakEquity = point.equity;
          const drawdown = peakEquity > 0 ? ((peakEquity - point.equity) / peakEquity) * 100 : 0;
          return {
            date: format(new Date(point.recorded_at || ''), 'MMM dd'),
            drawdown: Math.round(drawdown * 100) / 100,
            equity: point.equity,
          };
        });
        setDrawdownHistory(history);
      }
    };

    fetchDrawdownHistory();
  }, [user, riskStatus]);

  const filteredEvents = allEvents.filter(event => 
    filterSeverity === 'all' || event.severity === filterSeverity
  );

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'warning': return 'bg-warning text-warning-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-warning" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  // Summary stats
  const criticalCount = allEvents.filter(e => e.severity === 'critical').length;
  const warningCount = allEvents.filter(e => e.severity === 'warning').length;
  const infoCount = allEvents.filter(e => e.severity === 'info').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-7 h-7 text-primary" />
            Risk Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor risk metrics, configure limits, and review risk events
          </p>
        </div>
        <Button onClick={fetchRiskStatus} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-panel">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Current Drawdown</p>
                <p className="text-2xl font-bold text-foreground">
                  {riskStatus?.riskMetrics.drawdownPercent.toFixed(2) || '0.00'}%
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-warning opacity-50" />
            </div>
            <Progress 
              value={riskStatus?.riskMetrics.drawdownPercent || 0} 
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Daily Loss</p>
                <p className="text-2xl font-bold text-foreground">
                  {riskStatus?.riskMetrics.dailyLossPercent.toFixed(2) || '0.00'}%
                </p>
              </div>
              <Calendar className="w-8 h-8 text-primary opacity-50" />
            </div>
            <Progress 
              value={(riskStatus?.riskMetrics.dailyLossPercent || 0) / (riskStatus?.settings.maxDailyLoss || 5) * 100} 
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Weekly Loss</p>
                <p className="text-2xl font-bold text-foreground">
                  {riskStatus?.riskMetrics.weeklyLossPercent.toFixed(2) || '0.00'}%
                </p>
              </div>
              <Clock className="w-8 h-8 text-primary opacity-50" />
            </div>
            <Progress 
              value={(riskStatus?.riskMetrics.weeklyLossPercent || 0) / (riskStatus?.settings.weeklyLossLimit || 10) * 100} 
              className="mt-2 h-2"
            />
          </CardContent>
        </Card>

        <Card className="glass-panel">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Risk Events</p>
                <p className="text-2xl font-bold text-foreground">{allEvents.length}</p>
              </div>
              <Activity className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <div className="flex gap-2 mt-2">
              {criticalCount > 0 && (
                <Badge variant="destructive" className="text-xs">{criticalCount} Critical</Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="secondary" className="text-xs bg-warning/20 text-warning">{warningCount} Warn</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="replay">Replay</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="history">Event History</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <RiskStatusCard />
        </TabsContent>

        {/* Replay Tab */}
        <TabsContent value="replay" className="space-y-4">
          <ScalpingReplayPanel />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <RiskSettingsPanel />
        </TabsContent>

        {/* Event History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card className="glass-panel">
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle>Risk Event History</CardTitle>
                  <CardDescription>Complete log of all risk-related events</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
                  >
                    {sortOrder === 'desc' ? (
                      <ChevronDown className="w-4 h-4 mr-1" />
                    ) : (
                      <ChevronUp className="w-4 h-4 mr-1" />
                    )}
                    {sortOrder === 'desc' ? 'Newest' : 'Oldest'}
                  </Button>
                  <select
                    value={filterSeverity}
                    onChange={(e) => setFilterSeverity(e.target.value)}
                    className="px-3 py-1.5 text-sm rounded-md border border-input bg-background"
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {eventsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading events...</div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No risk events recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
                    >
                      {getSeverityIcon(event.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={getSeverityColor(event.severity)} variant="secondary">
                            {event.severity}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {event.event_type}
                          </span>
                        </div>
                        <p className="text-sm text-foreground">{event.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(event.created_at), 'MMM dd, yyyy HH:mm:ss')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Drawdown Chart */}
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-base">Drawdown Over Time</CardTitle>
                <CardDescription>Historical drawdown from peak equity</CardDescription>
              </CardHeader>
              <CardContent>
                {drawdownHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={drawdownHistory}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        className="text-xs fill-muted-foreground"
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis 
                        className="text-xs fill-muted-foreground"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        formatter={(value: number) => [`${value.toFixed(2)}%`, 'Drawdown']}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="drawdown" 
                        stroke="hsl(var(--destructive))" 
                        fill="hsl(var(--destructive) / 0.2)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No drawdown history available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Equity Chart */}
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-base">Equity History</CardTitle>
                <CardDescription>Portfolio value over time</CardDescription>
              </CardHeader>
              <CardContent>
                {drawdownHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={drawdownHistory}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        className="text-xs fill-muted-foreground"
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis 
                        className="text-xs fill-muted-foreground"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Equity']}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="equity" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No equity history available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Event Distribution */}
            <Card className="glass-panel lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Event Distribution</CardTitle>
                <CardDescription>Breakdown of risk events by severity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                    <p className="text-3xl font-bold text-destructive">{criticalCount}</p>
                    <p className="text-sm text-muted-foreground">Critical Events</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-warning/10 border border-warning/20">
                    <p className="text-3xl font-bold text-warning">{warningCount}</p>
                    <p className="text-sm text-muted-foreground">Warnings</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
                    <p className="text-3xl font-bold text-muted-foreground">{infoCount}</p>
                    <p className="text-sm text-muted-foreground">Info Events</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { useState, useMemo } from 'react';
import {
  History,
  Filter as FilterIcon,
  Brain,
  Loader2,
  Banknote,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useTradesData } from '@/hooks/useTradesData';

type TabType = 'history' | 'open';

export default function Trades() {
  const [activeTab, setActiveTab] = useState<TabType>('history');
  const { trades, positions, isLoading, tradingMode, stats } = useTradesData();

  const [symbolFilter, setSymbolFilter] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [minScore, setMinScore] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | open | closed | cancelled

  const visibleTrades = useMemo(() => {
    if (statusFilter === 'all') return trades;
    return trades.filter((t) => t.status === statusFilter);
  }, [trades, statusFilter]);

  const strategies = useMemo(
    () => Array.from(new Set(trades.map((t) => t.strategy).filter(Boolean) as string[])),
    [trades],
  );

  const filtered = useMemo(() => {
    return visibleTrades.filter((t) => {
      if (symbolFilter && !t.symbol.toLowerCase().includes(symbolFilter.toLowerCase())) return false;
      if (strategyFilter !== 'all' && t.strategy !== strategyFilter) return false;
      if (resultFilter === 'win' && (t.pnl ?? 0) <= 0) return false;
      if (resultFilter === 'loss' && (t.pnl ?? 0) >= 0) return false;
      if (modeFilter === 'paper' && !t.isPaper) return false;
      if (modeFilter === 'live' && t.isPaper) return false;
      if (minScore && (t.score ?? 0) < Number(minScore)) return false;
      const refDate = t.closedAt ?? t.createdAt;
      if (dateFrom && refDate < new Date(dateFrom)) return false;
      if (dateTo && refDate > new Date(dateTo + 'T23:59:59')) return false;
      return true;
    });
  }, [visibleTrades, symbolFilter, strategyFilter, resultFilter, modeFilter, minScore, dateFrom, dateTo]);


  const exportCsv = () => {
    const rows = [
      ['symbol', 'side', 'qty', 'entry', 'exit', 'pnl', 'score', 'confidence', 'strategy', 'mode', 'duration_s', 'opened', 'closed', 'entry_reason', 'exit_reason'],
      ...filtered.map((t) => [
        t.symbol, t.side, t.quantity, t.entryPrice, t.exitPrice ?? '',
        t.pnl ?? '', t.score ?? '', t.confidence ?? '', t.strategy ?? '',
        t.isPaper ? 'paper' : 'live', t.durationSeconds ?? '',
        t.createdAt.toISOString(), t.closedAt?.toISOString() ?? '',
        (t.entryReasoning ?? t.aiReason ?? '').replace(/[\r\n,]/g, ' '),
        (t.exitReason ?? '').replace(/[\r\n,]/g, ' '),
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trade-journal-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <History className="w-7 h-7 text-primary" />
            Trade Journal
          </h1>
          <p className="text-muted-foreground">Filter, review, and export every trade.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1',
            tradingMode === 'live' ? 'bg-loss/20 text-loss' : 'bg-primary/20 text-primary',
          )}>
            {tradingMode === 'live' ? <Banknote className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
            {tradingMode === 'live' ? 'Live' : 'Paper'}
          </span>
          <Button variant="outline" className="gap-2" onClick={exportCsv}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Total Trades</p>
          <p className="text-2xl font-bold text-foreground">{stats.totalTrades}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Win Rate</p>
          <p className="text-2xl font-bold text-foreground">{stats.winRate.toFixed(1)}%</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Total P&L</p>
          <p className={cn('text-2xl font-bold', stats.totalPnl >= 0 ? 'text-profit' : 'text-loss')}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Open Positions</p>
          <p className="text-2xl font-bold text-foreground">{stats.openPositions}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FilterIcon className="w-4 h-4" /> Filters
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <Input placeholder="Symbol" value={symbolFilter} onChange={(e) => setSymbolFilter(e.target.value)} />
          <Select value={strategyFilter} onValueChange={setStrategyFilter}>
            <SelectTrigger><SelectValue placeholder="Strategy" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All strategies</SelectItem>
              {strategies.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={resultFilter} onValueChange={setResultFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All results</SelectItem>
              <SelectItem value="win">Wins</SelectItem>
              <SelectItem value="loss">Losses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Paper + Live</SelectItem>
              <SelectItem value="paper">Paper</SelectItem>
              <SelectItem value="live">Live</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Active (open)</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Input type="number" placeholder="Min score" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setActiveTab('history')}
          className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'history' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
          All Trades ({filtered.length})
        </button>
        <button onClick={() => setActiveTab('open')}
          className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'open' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground')}>
          Open Positions ({positions.length})
        </button>
      </div>


      {activeTab === 'history' && (
        <div className="glass-panel overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No trades match these filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <th className="text-left py-3 px-4">Symbol</th>
                    <th className="text-left py-3 px-4">Status</th>
                    <th className="text-left py-3 px-4">Side</th>
                    <th className="text-right py-3 px-4">Qty</th>
                    <th className="text-right py-3 px-4">Entry</th>
                    <th className="text-right py-3 px-4">Exit</th>
                    <th className="text-right py-3 px-4">P&L</th>
                    <th className="text-right py-3 px-4">Score</th>
                    <th className="text-left py-3 px-4">Strategy</th>
                    <th className="text-left py-3 px-4">Mode</th>
                    <th className="text-right py-3 px-4">Duration</th>
                    <th className="text-left py-3 px-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((trade) => {
                    const pos = (trade.pnl ?? 0) >= 0;
                    const isOpen = trade.status === 'open';
                    return (
                      <tr key={trade.id} className="border-b border-border/50 hover:bg-secondary/30">
                        <td className="py-3 px-4 font-medium text-foreground">{trade.symbol}</td>
                        <td className="py-3 px-4">
                          <span className={cn('px-2 py-0.5 rounded text-xs uppercase',
                            trade.status === 'open' ? 'bg-primary/20 text-primary' :
                            trade.status === 'closed' ? 'bg-secondary text-muted-foreground' :
                            'bg-muted text-muted-foreground')}>
                            {trade.status === 'open' ? 'Active' : trade.status}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className={cn('px-2 py-0.5 rounded text-xs uppercase',
                            trade.side === 'buy' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive')}>
                            {trade.side}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">{trade.quantity}</td>
                        <td className="py-3 px-4 text-right font-mono text-muted-foreground">${trade.entryPrice.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono">{trade.exitPrice ? `$${trade.exitPrice.toLocaleString()}` : '—'}</td>
                        <td className={cn('py-3 px-4 text-right font-mono', trade.pnl == null ? 'text-muted-foreground' : pos ? 'text-profit' : 'text-loss')}>
                          {trade.pnl == null ? '—' : (
                            <span className="inline-flex items-center gap-1">
                              {pos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                              {pos ? '+' : ''}${(trade.pnl ?? 0).toFixed(2)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">{trade.score != null ? Math.round(trade.score) : '—'}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-xs bg-secondary text-muted-foreground inline-flex items-center gap-1">
                            {trade.strategy || 'Manual'}
                            {trade.aiReason && <Brain className="w-3 h-3 text-primary" />}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs">{trade.isPaper ? 'Paper' : 'Live'}</td>
                        <td className="py-3 px-4 text-right text-xs text-muted-foreground">
                          {trade.durationSeconds ? formatDuration(trade.durationSeconds) : isOpen ? 'Active' : '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{(trade.closedAt ?? trade.createdAt).toLocaleString()}</td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'open' && (
        <div className="glass-panel p-6">
          {positions.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">No open positions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                    <th className="text-left py-3 px-4">Symbol</th>
                    <th className="text-left py-3 px-4">Side</th>
                    <th className="text-right py-3 px-4">Qty</th>
                    <th className="text-right py-3 px-4">Entry</th>
                    <th className="text-right py-3 px-4">Current</th>
                    <th className="text-right py-3 px-4">Unrealized</th>
                    <th className="text-left py-3 px-4">Strategy</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const pnl = p.unrealizedPnl ?? 0;
                    return (
                      <tr key={p.id} className="border-b border-border/50">
                        <td className="py-3 px-4 font-medium">{p.symbol}</td>
                        <td className="py-3 px-4 capitalize">{p.side === 'buy' ? 'long' : 'short'}</td>
                        <td className="py-3 px-4 text-right font-mono">{p.quantity}</td>
                        <td className="py-3 px-4 text-right font-mono">${p.entryPrice.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right font-mono">${p.currentPrice?.toLocaleString() ?? '-'}</td>
                        <td className={cn('py-3 px-4 text-right font-mono', pnl >= 0 ? 'text-profit' : 'text-loss')}>
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground">{p.strategy || 'Manual'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

import { useState } from 'react';
import { 
  History, 
  Filter, 
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  Loader2,
  Banknote,
  Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTradesData } from '@/hooks/useTradesData';

type TabType = 'history' | 'open';

export default function Trades() {
  const [activeTab, setActiveTab] = useState<TabType>('history');
  const { trades, positions, isLoading, tradingMode, stats } = useTradesData();

  const closedTrades = trades.filter(t => t.status === 'closed');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <History className="w-7 h-7 text-primary" />
            Trade Management
          </h1>
          <p className="text-muted-foreground">View and analyze your trading history</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'px-3 py-1 text-xs font-medium rounded-full flex items-center gap-1',
            tradingMode === 'live' ? 'bg-loss/20 text-loss' : 'bg-primary/20 text-primary'
          )}>
            {tradingMode === 'live' ? <Banknote className="w-3 h-3" /> : <Wallet className="w-3 h-3" />}
            {tradingMode === 'live' ? 'Live' : 'Paper'} Trades
          </span>
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </Button>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
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
          <p className={cn(
            'text-2xl font-bold',
            stats.totalPnl >= 0 ? 'text-profit' : 'text-loss'
          )}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs text-muted-foreground mb-1">Open Positions</p>
          <p className="text-2xl font-bold text-foreground">{stats.openPositions}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'history'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground hover:text-foreground'
          )}
        >
          Trade History ({closedTrades.length})
        </button>
        <button
          onClick={() => setActiveTab('open')}
          className={cn(
            'px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'open'
              ? 'bg-primary text-primary-foreground'
              : 'bg-secondary text-muted-foreground hover:text-foreground'
          )}
        >
          Open Positions ({positions.length})
        </button>
      </div>

      {/* Trade History */}
      {activeTab === 'history' && (
        <div className="glass-panel overflow-hidden">
          {closedTrades.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No closed trades yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Trades will appear here when the AI executes them
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Side</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Qty</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entry</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Exit</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">P&L</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Strategy</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {closedTrades.map((trade) => (
                    <tr 
                      key={trade.id}
                      className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                    >
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold">
                            {trade.symbol.slice(0, 2)}
                          </div>
                          <span className="font-medium text-foreground">{trade.symbol}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className={cn(
                          'px-2 py-1 rounded text-xs font-medium uppercase',
                          trade.side === 'buy' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                        )}>
                          {trade.side}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-sm">{trade.quantity}</td>
                      <td className="py-4 px-6 text-right font-mono text-sm text-muted-foreground">
                        ${trade.entryPrice.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-sm">
                        ${trade.exitPrice?.toLocaleString()}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className={cn(
                          'flex items-center justify-end gap-1',
                          trade.pnl && trade.pnl >= 0 ? 'text-profit' : 'text-loss'
                        )}>
                          {trade.pnl && trade.pnl >= 0 ? (
                            <ArrowUpRight className="w-4 h-4" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4" />
                          )}
                          <span className="font-mono text-sm font-medium">
                            {trade.pnl && trade.pnl >= 0 ? '+' : ''}${trade.pnl?.toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs bg-secondary text-muted-foreground">
                            {trade.strategy || 'Manual'}
                          </span>
                          {trade.aiReason && (
                            <Brain className="w-4 h-4 text-primary" />
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-sm text-muted-foreground">
                        {trade.closedAt?.toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Open Positions */}
      {activeTab === 'open' && (
        <div className="glass-panel overflow-hidden">
          {positions.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No open positions</p>
              <p className="text-sm text-muted-foreground mt-1">
                Open positions will appear here when the AI enters trades
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Symbol</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Side</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Qty</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Entry</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Current</th>
                    <th className="text-right py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Unrealized P&L</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Strategy</th>
                    <th className="text-left py-4 px-6 text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => {
                    const pnl = position.unrealizedPnl || 0;
                    const pnlPercent = position.entryPrice > 0 && position.currentPrice 
                      ? ((position.currentPrice - position.entryPrice) / position.entryPrice) * 100 
                      : 0;
                    
                    return (
                      <tr 
                        key={position.id}
                        className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-xs font-bold">
                              {position.symbol.slice(0, 2)}
                            </div>
                            <span className="font-medium text-foreground">{position.symbol}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={cn(
                            'px-2 py-1 rounded text-xs font-medium uppercase',
                            position.side === 'buy' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
                          )}>
                            {position.side === 'buy' ? 'long' : 'short'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right font-mono text-sm">{position.quantity}</td>
                        <td className="py-4 px-6 text-right font-mono text-sm text-muted-foreground">
                          ${position.entryPrice.toLocaleString()}
                        </td>
                        <td className="py-4 px-6 text-right font-mono text-sm">
                          ${position.currentPrice?.toLocaleString() || '-'}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className={cn(
                            'flex items-center justify-end gap-1',
                            pnl >= 0 ? 'text-profit' : 'text-loss'
                          )}>
                            {pnl >= 0 ? (
                              <ArrowUpRight className="w-4 h-4" />
                            ) : (
                              <ArrowDownRight className="w-4 h-4" />
                            )}
                            <span className="font-mono text-sm font-medium">
                              {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                            </span>
                            <span className="text-xs">
                              ({pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%)
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-2 py-1 rounded text-xs bg-secondary text-muted-foreground">
                            {position.strategy || 'Manual'}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <Button variant="destructive" size="sm">
                            Close
                          </Button>
                        </td>
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

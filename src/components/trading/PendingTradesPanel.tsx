import { useState } from 'react';
import { 
  Clock, 
  Check, 
  X, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCheck,
  XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { usePendingTrades, PendingTrade } from '@/hooks/usePendingTrades';
import { formatDistanceToNow } from 'date-fns';

export function PendingTradesPanel() {
  const { 
    pendingTrades, 
    isLoading, 
    isProcessing,
    approveTrade, 
    rejectTrade,
    approveAll,
    rejectAll,
    pendingCount 
  } = usePendingTrades();
  
  const [expandedTrade, setExpandedTrade] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-warning animate-pulse" />
          <h3 className="text-lg font-semibold">Pending Trade Approvals</h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-secondary/30 rounded-lg" />
          <div className="h-16 bg-secondary/30 rounded-lg" />
        </div>
      </div>
    );
  }

  if (pendingCount === 0) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Pending Trade Approvals</h3>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <Check className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No pending trades to review</p>
          <p className="text-sm mt-1">AI will propose trades based on market conditions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-warning" />
          <h3 className="text-lg font-semibold">Pending Trade Approvals</h3>
          <Badge variant="secondary" className="bg-warning/20 text-warning">
            {pendingCount}
          </Badge>
        </div>
        
        {pendingCount > 1 && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={rejectAll}
              disabled={isProcessing}
              className="gap-1 text-loss hover:text-loss"
            >
              <XCircle className="w-4 h-4" />
              Reject All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={approveAll}
              disabled={isProcessing}
              className="gap-1 text-profit hover:text-profit"
            >
              <CheckCheck className="w-4 h-4" />
              Approve All
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {pendingTrades.map((trade) => (
          <TradeApprovalCard
            key={trade.id}
            trade={trade}
            isExpanded={expandedTrade === trade.id}
            onToggleExpand={() => setExpandedTrade(expandedTrade === trade.id ? null : trade.id)}
            onApprove={() => approveTrade(trade.id)}
            onReject={() => rejectTrade(trade.id)}
            isProcessing={isProcessing}
          />
        ))}
      </div>
    </div>
  );
}

interface TradeApprovalCardProps {
  trade: PendingTrade;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onApprove: () => void;
  onReject: () => void;
  isProcessing: boolean;
}

function TradeApprovalCard({ 
  trade, 
  isExpanded, 
  onToggleExpand, 
  onApprove, 
  onReject,
  isProcessing 
}: TradeApprovalCardProps) {
  const isBuy = trade.side === 'buy';
  const expiresIn = formatDistanceToNow(trade.expiresAt, { addSuffix: true });
  const isExpiringSoon = trade.expiresAt.getTime() - Date.now() < 5 * 60 * 1000; // 5 minutes

  return (
    <div className={cn(
      'rounded-lg border transition-all',
      isBuy ? 'border-profit/30 bg-profit/5' : 'border-loss/30 bg-loss/5',
      isExpanded && 'ring-2 ring-primary/20'
    )}>
      {/* Main Row */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              isBuy ? 'bg-profit/20' : 'bg-loss/20'
            )}>
              {isBuy ? (
                <TrendingUp className="w-5 h-5 text-profit" />
              ) : (
                <TrendingDown className="w-5 h-5 text-loss" />
              )}
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{trade.symbol}</span>
                <Badge variant={isBuy ? 'default' : 'destructive'} className="text-xs">
                  {trade.side.toUpperCase()}
                </Badge>
                {trade.strategy && (
                  <Badge variant="outline" className="text-xs">
                    {trade.strategy}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {trade.quantity.toFixed(6)} @ ${trade.price.toFixed(2)} = ${trade.positionValue.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Confidence Score */}
            <div className="text-right mr-4">
              <div className="flex items-center gap-1">
                <Zap className="w-4 h-4 text-warning" />
                <span className="text-sm font-medium">{(trade.confidence * 100).toFixed(0)}%</span>
              </div>
              <Progress value={trade.confidence * 100} className="w-16 h-1.5" />
            </div>

            {/* Expiry Warning */}
            <div className={cn(
              'text-xs flex items-center gap-1 px-2 py-1 rounded',
              isExpiringSoon ? 'bg-loss/20 text-loss' : 'bg-secondary/50 text-muted-foreground'
            )}>
              {isExpiringSoon && <AlertCircle className="w-3 h-3" />}
              <span>Expires {expiresIn}</span>
            </div>

            {/* Action Buttons */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onReject}
              disabled={isProcessing}
              className="text-loss hover:text-loss hover:bg-loss/20"
            >
              <X className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onApprove}
              disabled={isProcessing}
              className="text-profit hover:text-profit hover:bg-profit/20"
            >
              <Check className="w-5 h-5" />
            </Button>

            {/* Expand Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleExpand}
              className="text-muted-foreground"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-border/50">
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">AI Reasoning</p>
              <p className="text-sm text-foreground">{trade.aiReasoning}</p>
            </div>
            
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Market Regime: </span>
                <Badge variant="outline">{trade.marketRegime || 'Unknown'}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Proposed: </span>
                <span>{formatDistanceToNow(trade.createdAt, { addSuffix: true })}</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onReject}
                disabled={isProcessing}
                className="flex-1 gap-2 text-loss border-loss/30 hover:bg-loss/20"
              >
                <X className="w-4 h-4" />
                Reject Trade
              </Button>
              <Button
                size="sm"
                onClick={onApprove}
                disabled={isProcessing}
                className="flex-1 gap-2 bg-profit hover:bg-profit/90 text-white"
              >
                <Check className="w-4 h-4" />
                Approve & Execute
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

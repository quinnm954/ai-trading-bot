import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface PendingTrade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  positionValue: number;
  strategy: string | null;
  aiReasoning: string;
  confidence: number;
  marketRegime: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  expiresAt: Date;
  createdAt: Date;
  reviewedAt: Date | null;
  reviewNotes: string | null;
}

export function usePendingTrades() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchPendingTrades = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('pending_trades')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPendingTrades(
        (data || []).map((t: any) => ({
          id: t.id,
          symbol: t.symbol,
          side: t.side,
          quantity: t.quantity,
          price: t.price,
          positionValue: t.position_value,
          strategy: t.strategy,
          aiReasoning: t.ai_reasoning,
          confidence: t.confidence,
          marketRegime: t.market_regime,
          status: t.status,
          expiresAt: new Date(t.expires_at),
          createdAt: new Date(t.created_at),
          reviewedAt: t.reviewed_at ? new Date(t.reviewed_at) : null,
          reviewNotes: t.review_notes,
        }))
      );
    } catch (error) {
      console.error('Failed to fetch pending trades:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Approve a trade - execute it
  const approveTrade = async (tradeId: string) => {
    if (!user) return;
    setIsProcessing(true);

    try {
      // Get the pending trade details
      const trade = pendingTrades.find(t => t.id === tradeId);
      if (!trade) throw new Error('Trade not found');

      // Mark as approved
      const { error: updateError } = await supabase
        .from('pending_trades')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', tradeId);

      if (updateError) throw updateError;

      // Execute the trade via the trading engine
      const response = await supabase.functions.invoke('ai-trading-engine', {
        body: {
          action: 'execute_approved_trade',
          tradeId,
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          price: trade.price,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: 'Trade Approved & Executed',
        description: `${trade.side.toUpperCase()} ${trade.quantity} ${trade.symbol} @ $${trade.price.toFixed(2)}`,
      });

      fetchPendingTrades();
    } catch (error) {
      console.error('Failed to approve trade:', error);
      toast({
        title: 'Failed to execute trade',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Reject a trade
  const rejectTrade = async (tradeId: string, reason?: string) => {
    if (!user) return;
    setIsProcessing(true);

    try {
      const trade = pendingTrades.find(t => t.id === tradeId);

      const { error } = await supabase
        .from('pending_trades')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          review_notes: reason || 'Rejected by user',
        })
        .eq('id', tradeId);

      if (error) throw error;

      toast({
        title: 'Trade Rejected',
        description: trade ? `${trade.symbol} trade proposal dismissed` : 'Trade dismissed',
      });

      fetchPendingTrades();
    } catch (error) {
      console.error('Failed to reject trade:', error);
      toast({
        title: 'Failed to reject trade',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Approve all pending trades
  const approveAll = async () => {
    for (const trade of pendingTrades) {
      await approveTrade(trade.id);
    }
  };

  // Reject all pending trades
  const rejectAll = async () => {
    for (const trade of pendingTrades) {
      await rejectTrade(trade.id, 'Bulk rejection');
    }
  };

  useEffect(() => {
    fetchPendingTrades();
  }, [fetchPendingTrades]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`pending_trades_changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_trades',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPendingTrades();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchPendingTrades]);

  return {
    pendingTrades,
    isLoading,
    isProcessing,
    approveTrade,
    rejectTrade,
    approveAll,
    rejectAll,
    refetch: fetchPendingTrades,
    pendingCount: pendingTrades.length,
  };
}

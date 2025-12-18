import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface FollowedTrader {
  id: string;
  user_id: string;
  trader_id: string;
  followed_at: string;
  is_active: boolean;
  copy_percentage: number;
  max_copy_amount_usd: number;
}

export function useFollowedTraders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: followedTraders, isLoading } = useQuery({
    queryKey: ['followed-traders', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('followed_traders')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      return data as FollowedTrader[];
    },
    enabled: !!user?.id,
  });

  const followMutation = useMutation({
    mutationFn: async ({ traderId, copyPercentage = 10, maxCopyAmount = 100 }: { 
      traderId: string; 
      copyPercentage?: number; 
      maxCopyAmount?: number;
    }) => {
      if (!user?.id) throw new Error('Must be logged in');
      
      const { data, error } = await supabase
        .from('followed_traders')
        .insert({
          user_id: user.id,
          trader_id: traderId,
          copy_percentage: copyPercentage,
          max_copy_amount_usd: maxCopyAmount,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followed-traders'] });
      toast.success('Now following trader', {
        description: 'Their signals will be used by the AI for copy trading'
      });
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('Already following this trader');
      } else {
        toast.error('Failed to follow trader');
      }
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: async (traderId: string) => {
      if (!user?.id) throw new Error('Must be logged in');
      
      const { error } = await supabase
        .from('followed_traders')
        .delete()
        .eq('user_id', user.id)
        .eq('trader_id', traderId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followed-traders'] });
      toast.success('Unfollowed trader');
    },
    onError: () => {
      toast.error('Failed to unfollow trader');
    },
  });

  const isFollowing = (traderId: string) => {
    return followedTraders?.some(f => f.trader_id === traderId) ?? false;
  };

  const getFollowedTraderIds = () => {
    return followedTraders?.filter(f => f.is_active).map(f => f.trader_id) ?? [];
  };

  return {
    followedTraders,
    isLoading,
    followTrader: followMutation.mutate,
    unfollowTrader: unfollowMutation.mutate,
    isFollowing,
    getFollowedTraderIds,
    isFollowingLoading: followMutation.isPending,
    isUnfollowingLoading: unfollowMutation.isPending,
  };
}

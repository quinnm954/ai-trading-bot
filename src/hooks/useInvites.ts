import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useIsAdmin } from './useIsAdmin';
import { toast } from 'sonner';

interface InviteCode {
  id: string;
  code: string;
  created_at: string;
  expires_at: string;
  used_by: string | null;
  used_at: string | null;
}

export const useInvites = () => {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchInvites = async () => {
    if (!user || !isAdmin) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching invites:', error);
    } else {
      setInvites(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) {
      fetchInvites();
    }
  }, [isAdmin, user]);

  const generateInviteCode = async () => {
    if (!user || !isAdmin) {
      toast.error('Only admins can generate invite codes');
      return null;
    }

    const code = `TITAN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const { data, error } = await supabase
      .from('invite_codes')
      .insert({
        code,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating invite:', error);
      toast.error('Failed to create invite code');
      return null;
    }

    toast.success('Invite code created!');
    await fetchInvites();
    return data;
  };

  const getInviteLink = (code: string) => {
    return `${window.location.origin}/auth?invite=${code}`;
  };

  const shareInvite = async (code: string) => {
    const link = getInviteLink(code);
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Titan AI Trader',
          text: 'You\'ve been invited to Titan AI Trader with full free access!',
          url: link,
        });
        toast.success('Invite shared!');
      } catch (err) {
        // User cancelled or share failed, fallback to clipboard
        await copyToClipboard(link);
      }
    } else {
      await copyToClipboard(link);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Invite link copied to clipboard!');
    } catch (err) {
      toast.error('Failed to copy link');
    }
  };

  const validateInviteCode = async (code: string) => {
    const { data, error } = await supabase
      .from('invite_codes')
      .select('*')
      .eq('code', code)
      .is('used_by', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return { valid: false, invite: null };
    }

    return { valid: true, invite: data };
  };

  const useInviteCode = async (code: string, userId: string) => {
    // Mark invite as used
    const { error: updateError } = await supabase
      .from('invite_codes')
      .update({
        used_by: userId,
        used_at: new Date().toISOString(),
      })
      .eq('code', code);

    if (updateError) {
      console.error('Error using invite code:', updateError);
      return false;
    }

    // Grant free access to the user
    const { error: roleError } = await supabase
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: 'user',
        has_free_access: true,
        invited_by: (await supabase.from('invite_codes').select('created_by').eq('code', code).single()).data?.created_by,
      });

    if (roleError) {
      console.error('Error granting free access:', roleError);
    }

    return true;
  };

  return {
    invites,
    loading,
    generateInviteCode,
    getInviteLink,
    shareInvite,
    validateInviteCode,
    useInviteCode,
    refetch: fetchInvites,
  };
};

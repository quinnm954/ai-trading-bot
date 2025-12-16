import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useIsAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function checkAdminStatus() {
      if (!user) {
        console.log('[useIsAdmin] No user, setting isAdmin to false');
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      console.log('[useIsAdmin] Checking admin status for user:', user.id, user.email);
      
      const { data, error } = await supabase
        .rpc('is_admin', { _user_id: user.id });

      console.log('[useIsAdmin] RPC result:', { data, error });

      if (!error && data === true) {
        console.log('[useIsAdmin] User IS admin');
        setIsAdmin(true);
      } else {
        console.log('[useIsAdmin] User is NOT admin, error:', error);
        setIsAdmin(false);
      }
      setIsLoading(false);
    }

    checkAdminStatus();
  }, [user]);

  return { isAdmin, isLoading };
}

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

      // Set loading to true before starting the check
      setIsLoading(true);
      console.log('[useIsAdmin] Checking admin status for user:', user.id, user.email);
      
      try {
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
      } catch (err) {
        console.error('[useIsAdmin] Error checking admin status:', err);
        setIsAdmin(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkAdminStatus();
  }, [user]);

  return { isAdmin, isLoading };
}

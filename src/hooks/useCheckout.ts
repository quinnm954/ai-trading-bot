import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Wallet-first checkout. Apple Pay / Google Pay buttons are rendered by the
 * hosted checkout page on supported devices, with card entry as fallback.
 */
export function useCheckout() {
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);

  const startCheckout = useCallback(async () => {
    setIsStartingCheckout(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in first');
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout');
      if (error) {
        const details = 'context' in (error as any) && (error as any).context
          ? await (error as any).context.text()
          : error.message;
        console.error('create-checkout failed:', details);
        toast.error('Could not start checkout', { description: String(details).slice(0, 200) });
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error('Checkout URL missing');
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setIsStartingCheckout(false);
    }
  }, []);

  const openPortal = useCallback(async () => {
    setIsOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) {
        const details = 'context' in (error as any) && (error as any).context
          ? await (error as any).context.text()
          : error.message;
        console.error('customer-portal failed:', details);
        toast.error('Could not open billing portal', { description: String(details).slice(0, 200) });
        return;
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Could not open billing portal');
    } finally {
      setIsOpeningPortal(false);
    }
  }, []);

  return { startCheckout, openPortal, isStartingCheckout, isOpeningPortal };
}

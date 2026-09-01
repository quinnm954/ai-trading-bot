import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CryptoInvoice {
  invoice_id: string;
  amount: string;
  amount_base_units: string;
  wallet_address: string;
  chain: string;
  chain_name: string;
  chain_id: number;
  token: string;
  token_address: string;
  payment_uri: string;
  expires_at: string;
  status: string;
}

/** How often we ask the backend to re-scan the chain while a payment is pending. */
const POLL_INTERVAL_MS = 15_000;

async function readError(error: unknown): Promise<string> {
  const anyErr = error as { context?: { text: () => Promise<string> }; message?: string };
  if (anyErr?.context) {
    try {
      return await anyErr.context.text();
    } catch {
      /* fall through */
    }
  }
  return anyErr?.message ?? String(error);
}

/**
 * Direct-to-wallet crypto checkout. The user sends an exact USDC amount to the
 * owner's address; the backend matches that amount on-chain and grants 30 days.
 * No payment processor is involved at any point.
 */
export function useCryptoCheckout() {
  const [invoice, setInvoice] = useState<CryptoInvoice | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState<'idle' | 'pending' | 'confirmed' | 'expired'>('idle');
  const [notConfigured, setNotConfigured] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const createInvoice = useCallback(async () => {
    setIsCreating(true);
    setNotConfigured(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please sign in first');
        return null;
      }

      const { data, error } = await supabase.functions.invoke('create-crypto-invoice');

      if (error) {
        const details = await readError(error);
        console.error('create-crypto-invoice failed:', details);
        if (details.includes('not_configured') || details.includes('not configured')) {
          setNotConfigured(true);
          return null;
        }
        toast.error('Could not start payment', { description: details.slice(0, 200) });
        return null;
      }

      if (data?.not_configured) {
        setNotConfigured(true);
        return null;
      }

      setInvoice(data as CryptoInvoice);
      setStatus('pending');
      return data as CryptoInvoice;
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Could not start payment');
      return null;
    } finally {
      setIsCreating(false);
    }
  }, []);

  /** Asks the backend to scan the chain now and reports our invoice's state. */
  const checkPayment = useCallback(async (showToast = false) => {
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-crypto-payments');
      if (error) {
        const details = await readError(error);
        console.error('verify-crypto-payments failed:', details);
        if (showToast) {
          toast.error('Could not check the blockchain', { description: details.slice(0, 200) });
        }
        return false;
      }

      const invoiceState = data?.invoice as { status?: string } | null;
      if (invoiceState?.status === 'confirmed') {
        setStatus('confirmed');
        stopPolling();
        return true;
      }
      if (invoiceState?.status === 'expired') {
        setStatus('expired');
        stopPolling();
        return false;
      }
      if (showToast) {
        toast.info('No payment found yet', {
          description: 'Transfers usually confirm within a minute of sending.',
        });
      }
      return false;
    } catch (err) {
      console.error(err);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, [stopPolling]);

  /** Poll while a payment is outstanding. */
  useEffect(() => {
    if (status !== 'pending' || !invoice) {
      stopPolling();
      return;
    }
    pollRef.current = setInterval(() => { void checkPayment(false); }, POLL_INTERVAL_MS);
    return stopPolling;
  }, [status, invoice, checkPayment, stopPolling]);

  /** Instant confirmation the moment the backend credits the invoice. */
  useEffect(() => {
    if (!invoice?.invoice_id) return;

    const channel = supabase
      .channel(`crypto-invoice-${invoice.invoice_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crypto_invoices',
          filter: `id=eq.${invoice.invoice_id}`,
        },
        (payload) => {
          const next = (payload.new as { status?: string })?.status;
          if (next === 'confirmed') {
            setStatus('confirmed');
            stopPolling();
          } else if (next === 'expired') {
            setStatus('expired');
            stopPolling();
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [invoice?.invoice_id, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setInvoice(null);
    setStatus('idle');
    setNotConfigured(false);
  }, [stopPolling]);

  return {
    invoice,
    status,
    isCreating,
    isChecking,
    notConfigured,
    createInvoice,
    checkPayment,
    reset,
  };
}

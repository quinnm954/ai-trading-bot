import { supabase } from '@/integrations/supabase/client';

export interface CloseAllResult {
  success: boolean;
  closed: number;
  error?: string;
}

/**
 * Flatten every open position for the active trading mode.
 * Paper -> close-all-paper-positions (marks trades closed, credits proceeds)
 * Live  -> auto-take-profit `sell-all` (real Coinbase liquidation to USDC)
 */
export async function closeAllPositions(mode: 'paper' | 'live'): Promise<CloseAllResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { success: false, closed: 0, error: 'Not authenticated' };
    }

    const base = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };

    if (mode === 'paper') {
      const res = await fetch(`${base}/close-all-paper-positions`, { method: 'POST', headers });
      const json = await res.json();
      if (!res.ok || json?.error) {
        return { success: false, closed: 0, error: json?.error || `HTTP ${res.status}` };
      }
      return { success: true, closed: Number(json?.closed || 0) };
    }

    const res = await fetch(`${base}/auto-take-profit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'sell-all' }),
    });
    const json = await res.json();
    if (!res.ok || json?.error) {
      return { success: false, closed: 0, error: json?.error || `HTTP ${res.status}` };
    }
    return { success: true, closed: Number(json?.holdingsSold || 0) };
  } catch (e) {
    return { success: false, closed: 0, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

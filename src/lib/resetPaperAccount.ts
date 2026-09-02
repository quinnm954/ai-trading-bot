import { supabase } from '@/integrations/supabase/client';

export const DEFAULT_PAPER_BALANCE = 100000;

/**
 * Full paper-account reset, executed server-side in one transaction.
 * Clears every piece of data derived from paper trading (trades, positions,
 * equity history, daily P&L, expectancy inputs, AI/agent logs) and sets the
 * balance. Live broker data is never touched.
 */
export async function resetPaperAccount(balance = DEFAULT_PAPER_BALANCE) {
  const { error } = await supabase.rpc('reset_paper_account', { p_balance: balance });
  if (error) throw error;
}

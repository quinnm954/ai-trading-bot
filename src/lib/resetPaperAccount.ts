import { supabase } from '@/integrations/supabase/client';

export const DEFAULT_PAPER_BALANCE = 100000;

/**
 * Full paper-account reset: balance plus every piece of derived data that is
 * computed from paper trading activity. Live broker data is never touched.
 */
export async function resetPaperAccount(balance = DEFAULT_PAPER_BALANCE) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const uid = user.id;

  // 1. Balance
  const { error: accountError } = await supabase
    .from('paper_account')
    .update({ balance, initial_balance: balance })
    .eq('user_id', uid);
  if (accountError) throw accountError;

  // 2. Paper trading records (live rows preserved)
  await Promise.all([
    supabase.from('trades').delete().eq('user_id', uid).eq('is_paper', true),
    supabase.from('positions').delete().eq('user_id', uid).eq('is_paper', true),
    supabase.from('futures_positions').delete().eq('user_id', uid).eq('is_paper', true),
  ]);

  // 3. Derived analytics, risk and AI history
  await Promise.all([
    supabase.from('equity_history').delete().eq('user_id', uid),
    supabase.from('daily_pnl').delete().eq('user_id', uid),
    supabase.from('risk_events').delete().eq('user_id', uid),
    supabase.from('ai_decisions').delete().eq('user_id', uid),
    supabase.from('signal_scores').delete().eq('user_id', uid),
    supabase.from('strategy_performance').delete().eq('user_id', uid),
    supabase.from('symbol_cooldowns').delete().eq('user_id', uid),
    supabase.from('pending_trades').delete().eq('user_id', uid),
    supabase.from('trade_journal_notes').delete().eq('user_id', uid),
    supabase.from('backtest_runs').delete().eq('user_id', uid),
    supabase.from('liquidation_estimates').delete().eq('user_id', uid),
    supabase.from('margin_logs').delete().eq('user_id', uid),
    supabase.from('grid_layouts').delete().eq('user_id', uid),
    supabase.from('copy_trade_signals').delete().eq('user_id', uid),
    supabase.from('agent_messages').delete().eq('user_id', uid),
    supabase.from('agent_incidents').delete().eq('user_id', uid),
  ]);

  // 4. Fresh starting equity point
  await supabase.from('equity_history').insert({ user_id: uid, equity: balance });

  // 5. Reset risk trackers and agent counters
  await Promise.all([
    supabase
      .from('ai_settings')
      .update({
        current_drawdown: 0,
        peak_equity: balance,
        daily_loss_today: 0,
        weekly_loss_current: 0,
        kill_switch_active: false,
        kill_switch_triggered_at: null,
        last_loss_reset_date: new Date().toISOString().slice(0, 10),
      })
      .eq('user_id', uid),
    supabase
      .from('agent_state')
      .update({ cycle_count: 0, error_count: 0, current_task: null })
      .eq('user_id', uid),
  ]);
}

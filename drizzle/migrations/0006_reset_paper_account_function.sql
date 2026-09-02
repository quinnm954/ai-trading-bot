CREATE OR REPLACE FUNCTION public.reset_paper_account(p_balance numeric DEFAULT 100000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_balance IS NULL OR p_balance < 0 THEN
    RAISE EXCEPTION 'Invalid balance';
  END IF;

  -- Paper trading records (live rows preserved)
  DELETE FROM public.trades WHERE user_id = v_uid AND is_paper = true;
  DELETE FROM public.positions WHERE user_id = v_uid AND is_paper = true;
  DELETE FROM public.futures_positions WHERE user_id = v_uid AND is_paper = true;

  -- Derived analytics, risk and AI history
  DELETE FROM public.equity_history WHERE user_id = v_uid;
  DELETE FROM public.daily_pnl WHERE user_id = v_uid;
  DELETE FROM public.risk_events WHERE user_id = v_uid;
  DELETE FROM public.ai_decisions WHERE user_id = v_uid;
  DELETE FROM public.signal_scores WHERE user_id = v_uid;
  DELETE FROM public.strategy_performance WHERE user_id = v_uid;
  DELETE FROM public.symbol_cooldowns WHERE user_id = v_uid;
  DELETE FROM public.pending_trades WHERE user_id = v_uid;
  DELETE FROM public.trade_journal_notes WHERE user_id = v_uid;
  DELETE FROM public.backtest_runs WHERE user_id = v_uid;
  DELETE FROM public.liquidation_estimates WHERE user_id = v_uid;
  DELETE FROM public.margin_logs WHERE user_id = v_uid;
  DELETE FROM public.grid_layouts WHERE user_id = v_uid;
  DELETE FROM public.copy_trade_signals WHERE user_id = v_uid;
  DELETE FROM public.agent_messages WHERE user_id = v_uid;
  DELETE FROM public.agent_incidents WHERE user_id = v_uid;

  -- Balance
  UPDATE public.paper_account
  SET balance = p_balance, initial_balance = p_balance, updated_at = now()
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    INSERT INTO public.paper_account (user_id, balance, initial_balance)
    VALUES (v_uid, p_balance, p_balance);
  END IF;

  -- Fresh starting equity point
  INSERT INTO public.equity_history (user_id, equity) VALUES (v_uid, p_balance);

  -- Reset risk trackers and agent counters
  UPDATE public.ai_settings
  SET current_drawdown = 0,
      peak_equity = p_balance,
      daily_loss_today = 0,
      weekly_loss_current = 0,
      kill_switch_active = false,
      kill_switch_triggered_at = NULL,
      last_loss_reset_date = CURRENT_DATE,
      updated_at = now()
  WHERE user_id = v_uid;

  UPDATE public.agent_state
  SET cycle_count = 0, error_count = 0, current_task = NULL
  WHERE user_id = v_uid;

  RETURN jsonb_build_object('success', true, 'balance', p_balance);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_paper_account(numeric) TO authenticated;
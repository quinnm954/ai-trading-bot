CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role, trial_started_at) VALUES (NEW.id, 'user', now());
  INSERT INTO public.paper_account (user_id, balance, initial_balance) VALUES (NEW.id, 100000, 100000);
  INSERT INTO public.ai_settings (
    user_id, enabled, bot_status, trading_mode, current_regime,
    max_capital_usage, max_position_size, max_daily_loss,
    max_concurrent_trades, allowed_markets,
    max_leverage, max_drawdown, weekly_loss_limit,
    risk_tolerance, prioritize_moonshots, meme_coins_only, reinvest_profits,
    kill_switch_active
  ) VALUES (
    NEW.id, false, 'idle', 'paper', 'ranging', 85, 15, 3, 12, ARRAY['crypto'],
    1, 25, 12, 'moderate', false, false, false, false
  );
  INSERT INTO public.scalp_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.strategy_performance (user_id, strategy, market_regime, score, win_rate, total_trades, avg_profit)
  VALUES
    (NEW.id, 'ema_crossover', 'trending', 85, 65.0, 0, 0),
    (NEW.id, 'macd', 'trending', 75, 60.0, 0, 0),
    (NEW.id, 'trend_breakout', 'trending', 80, 62.0, 0, 0),
    (NEW.id, 'rsi', 'ranging', 78, 68.0, 0, 0),
    (NEW.id, 'grid', 'ranging', 72, 75.0, 0, 0),
    (NEW.id, 'grid', 'high_volatility', 70, 72.0, 0, 0),
    (NEW.id, 'volatility_breakout', 'high_volatility', 74, 58.0, 0, 0),
    (NEW.id, 'dca', 'low_volatility', 72, 80.0, 0, 0),
    (NEW.id, 'rsi', 'low_volatility', 65, 62.0, 0, 0),
    (NEW.id, 'custom', 'news_driven', 45, 40.0, 0, 0);
  INSERT INTO public.equity_history (user_id, equity) VALUES (NEW.id, 100000);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.credit_crypto_invoice(p_invoice_id uuid, p_tx_hash text, p_from_address text, p_block_number bigint)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_existing_end TIMESTAMPTZ;
  v_new_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_invoice FROM public.crypto_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_invoice.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', true, 'already_confirmed', true);
  END IF;
  SELECT current_period_end INTO v_existing_end FROM public.subscriptions
  WHERE user_id = v_invoice.user_id AND status = 'active' AND current_period_end > now();
  v_new_end := COALESCE(v_existing_end, now()) + INTERVAL '30 days';
  INSERT INTO public.subscriptions (user_id, tier, status, current_period_start, current_period_end, cancel_at_period_end, updated_at)
  VALUES (v_invoice.user_id, 'pro', 'active', now(), v_new_end, false, now())
  ON CONFLICT (user_id) DO UPDATE SET tier='pro', status='active',
    current_period_start = COALESCE(public.subscriptions.current_period_start, now()),
    current_period_end = v_new_end, cancel_at_period_end=false, updated_at=now();
  UPDATE public.crypto_invoices SET status='confirmed', tx_hash=p_tx_hash, from_address=p_from_address,
    block_number=p_block_number, confirmed_at=now() WHERE id = p_invoice_id;
  IF NOT EXISTS (SELECT 1 FROM public.live_account WHERE user_id = v_invoice.user_id) THEN
    INSERT INTO public.live_account (user_id, provider, balance, buying_power, equity)
    VALUES (v_invoice.user_id, 'coinbase', 0, 0, 0);
  END IF;
  -- Bots are NOT auto-started on payment; owner keeps them off until explicitly started.
  RETURN jsonb_build_object('success', true, 'period_end', v_new_end, 'bots_started', false);
END;
$function$;

UPDATE public.ai_settings SET enabled = false, bot_status = 'idle', updated_at = now();
UPDATE public.copy_trading_settings SET enabled = false WHERE enabled = true;
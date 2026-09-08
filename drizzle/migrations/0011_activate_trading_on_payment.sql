CREATE OR REPLACE FUNCTION public.credit_crypto_invoice(p_invoice_id uuid, p_tx_hash text, p_from_address text, p_block_number bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_existing_end TIMESTAMPTZ;
  v_new_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_invoice FROM public.crypto_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF v_invoice.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', true, 'already_confirmed', true);
  END IF;

  SELECT current_period_end INTO v_existing_end
  FROM public.subscriptions
  WHERE user_id = v_invoice.user_id
    AND status = 'active'
    AND current_period_end > now();

  v_new_end := COALESCE(v_existing_end, now()) + INTERVAL '30 days';

  INSERT INTO public.subscriptions (
    user_id, tier, status, current_period_start, current_period_end, cancel_at_period_end, updated_at
  ) VALUES (
    v_invoice.user_id, 'pro', 'active', now(), v_new_end, false, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = 'pro',
    status = 'active',
    current_period_start = COALESCE(public.subscriptions.current_period_start, now()),
    current_period_end = v_new_end,
    cancel_at_period_end = false,
    updated_at = now();

  UPDATE public.crypto_invoices
  SET status = 'confirmed',
      tx_hash = p_tx_hash,
      from_address = p_from_address,
      block_number = p_block_number,
      confirmed_at = now()
  WHERE id = p_invoice_id;

  -- Provision a live account shell so live trading is unlocked once broker keys are added
  IF NOT EXISTS (
    SELECT 1 FROM public.live_account WHERE user_id = v_invoice.user_id
  ) THEN
    INSERT INTO public.live_account (user_id, provider, balance, buying_power, equity)
    VALUES (v_invoice.user_id, 'coinbase', 0, 0, 0);
  END IF;

  -- Start the trading bots for the paying user (paper mode until broker keys connected)
  UPDATE public.ai_settings
  SET enabled = true,
      bot_status = 'trading',
      kill_switch_active = false,
      kill_switch_triggered_at = NULL,
      daily_loss_today = 0,
      weekly_loss_current = 0,
      last_loss_reset_date = CURRENT_DATE,
      updated_at = now()
  WHERE user_id = v_invoice.user_id;

  IF NOT FOUND THEN
    INSERT INTO public.ai_settings (
      user_id, enabled, bot_status, current_regime,
      max_capital_usage, max_position_size, max_daily_loss,
      max_concurrent_trades, allowed_markets
    ) VALUES (
      v_invoice.user_id, true, 'trading', 'ranging', 80, 15, 2, 12, ARRAY['crypto']
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'period_end', v_new_end, 'bots_started', true);
END;
$function$;
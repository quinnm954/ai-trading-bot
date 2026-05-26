ALTER TABLE public.ai_settings ALTER COLUMN max_daily_loss SET DEFAULT 2;

CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role, trial_started_at)
  VALUES (NEW.id, 'user', now());

  INSERT INTO public.paper_account (user_id, balance, initial_balance)
  VALUES (NEW.id, 100000, 100000);

  INSERT INTO public.ai_settings (
    user_id,
    enabled,
    bot_status,
    current_regime,
    max_capital_usage,
    max_position_size,
    max_daily_loss,
    max_concurrent_trades,
    allowed_markets
  )
  VALUES (
    NEW.id,
    false,
    'idle',
    'ranging',
    80,
    10,
    2,
    5,
    ARRAY['stocks', 'crypto']
  );

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

  INSERT INTO public.equity_history (user_id, equity)
  VALUES (NEW.id, 100000);

  RETURN NEW;
END;
$function$;
-- Canonical scalp/exit defaults for every new account
ALTER TABLE public.scalp_settings ALTER COLUMN take_profit_pct SET DEFAULT 4.0;
ALTER TABLE public.scalp_settings ALTER COLUMN hard_stop_loss_pct SET DEFAULT 0.8;
ALTER TABLE public.scalp_settings ALTER COLUMN trailing_drop_pct SET DEFAULT 0.4;
ALTER TABLE public.scalp_settings ALTER COLUMN max_concurrent_positions SET DEFAULT 12;
ALTER TABLE public.scalp_settings ALTER COLUMN max_capital_usage_pct SET DEFAULT 85;
ALTER TABLE public.scalp_settings ALTER COLUMN target_position_size_usd SET DEFAULT 160;
ALTER TABLE public.scalp_settings ALTER COLUMN wide_stop_mode SET DEFAULT true;

-- New signups get the same locked strict risk parameters as existing accounts
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
    user_id, enabled, bot_status, current_regime,
    max_capital_usage, max_position_size, max_daily_loss,
    max_concurrent_trades, allowed_markets,
    max_leverage, max_drawdown, weekly_loss_limit,
    risk_tolerance, prioritize_moonshots, meme_coins_only, reinvest_profits
  ) VALUES (
    NEW.id, false, 'idle', 'ranging', 85, 15, 3, 12, ARRAY['crypto'],
    1, 25, 12, 'moderate', false, false, false
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

  INSERT INTO public.equity_history (user_id, equity)
  VALUES (NEW.id, 100000);

  RETURN NEW;
END;
$function$;
-- Update the trigger function to also create user_roles
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Create user role (default to 'user')
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');

  -- Create paper trading account with $100k starting balance
  INSERT INTO public.paper_account (user_id, balance, initial_balance)
  VALUES (NEW.id, 100000, 100000);

  -- Create default AI settings
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
    5,
    5,
    ARRAY['stocks', 'crypto']
  );

  -- Seed initial strategy performance data for each regime
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

  -- Add initial equity point
  INSERT INTO public.equity_history (user_id, equity)
  VALUES (NEW.id, 100000);

  RETURN NEW;
END;
$$;

-- Backfill missing user_roles for existing users (from paper_account since all users have one)
INSERT INTO public.user_roles (user_id, role)
SELECT pa.user_id, 'user'::app_role
FROM public.paper_account pa
WHERE pa.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = pa.user_id
  );
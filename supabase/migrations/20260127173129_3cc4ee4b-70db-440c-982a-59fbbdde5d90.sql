-- Add trial_started_at column to user_roles table
ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Backfill existing users: set trial_started_at to their created_at
UPDATE public.user_roles 
SET trial_started_at = created_at 
WHERE trial_started_at IS NULL;

-- Update the handle_new_user_setup trigger function to include trial_started_at
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Create user role (default to 'user') with trial start date
  INSERT INTO public.user_roles (user_id, role, trial_started_at)
  VALUES (NEW.id, 'user', now());

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
$function$;
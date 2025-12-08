-- Create function to initialize new user data
CREATE OR REPLACE FUNCTION public.handle_new_user_setup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    -- Trending regime
    (NEW.id, 'ema_crossover', 'trending', 85, 65.0, 0, 0),
    (NEW.id, 'macd', 'trending', 75, 60.0, 0, 0),
    (NEW.id, 'trend_breakout', 'trending', 80, 62.0, 0, 0),
    -- Ranging regime
    (NEW.id, 'rsi', 'ranging', 78, 68.0, 0, 0),
    (NEW.id, 'grid', 'ranging', 72, 75.0, 0, 0),
    -- High volatility regime
    (NEW.id, 'grid', 'high_volatility', 70, 72.0, 0, 0),
    (NEW.id, 'volatility_breakout', 'high_volatility', 74, 58.0, 0, 0),
    -- Low volatility regime
    (NEW.id, 'dca', 'low_volatility', 72, 80.0, 0, 0),
    (NEW.id, 'rsi', 'low_volatility', 65, 62.0, 0, 0),
    -- News driven regime
    (NEW.id, 'custom', 'news_driven', 45, 40.0, 0, 0);

  -- Add initial equity point
  INSERT INTO public.equity_history (user_id, equity)
  VALUES (NEW.id, 100000);

  RETURN NEW;
END;
$$;

-- Create trigger to run on new user signup
CREATE TRIGGER on_auth_user_created_setup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_setup();
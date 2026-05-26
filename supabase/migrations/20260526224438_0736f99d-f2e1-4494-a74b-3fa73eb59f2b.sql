CREATE TABLE public.scalp_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  preset TEXT NOT NULL DEFAULT 'balanced',
  entry_min_5m_pct NUMERIC NOT NULL DEFAULT 0.3,
  entry_min_15m_pct NUMERIC NOT NULL DEFAULT 0.2,
  entry_min_1h_pct NUMERIC NOT NULL DEFAULT 0.3,
  entry_min_24h_pct NUMERIC NOT NULL DEFAULT 0.3,
  reentry_breakout_pct NUMERIC NOT NULL DEFAULT 0.25,
  chase_guard_minutes INTEGER NOT NULL DEFAULT 120,
  take_profit_pct NUMERIC NOT NULL DEFAULT 1.0,
  trailing_drop_pct NUMERIC NOT NULL DEFAULT 1.5,
  hard_stop_loss_pct NUMERIC NOT NULL DEFAULT 3.0,
  momentum_rotation_min_pct NUMERIC NOT NULL DEFAULT 0.5,
  loss_rotation_enabled BOOLEAN NOT NULL DEFAULT true,
  loss_rotation_max_loss_pct NUMERIC NOT NULL DEFAULT -2.0,
  loss_rotation_momentum_edge_pct NUMERIC NOT NULL DEFAULT 0.5,
  loss_rotation_min_age_sec INTEGER NOT NULL DEFAULT 300,
  loss_rotation_cooldown_sec INTEGER NOT NULL DEFAULT 60,
  max_concurrent_positions INTEGER NOT NULL DEFAULT 12,
  target_position_size_usd NUMERIC NOT NULL DEFAULT 50,
  max_capital_usage_pct NUMERIC NOT NULL DEFAULT 80,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.scalp_settings TO authenticated;
GRANT ALL ON public.scalp_settings TO service_role;

ALTER TABLE public.scalp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own scalp settings" ON public.scalp_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own scalp settings" ON public.scalp_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own scalp settings" ON public.scalp_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Scalp settings cannot be deleted" ON public.scalp_settings
  FOR DELETE TO authenticated USING (false);

CREATE TRIGGER update_scalp_settings_updated_at
  BEFORE UPDATE ON public.scalp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill existing users
INSERT INTO public.scalp_settings (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- Extend new-user setup to seed scalp_settings
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
    max_concurrent_trades, allowed_markets
  ) VALUES (
    NEW.id, false, 'idle', 'ranging', 80, 10, 2, 5, ARRAY['stocks', 'crypto']
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

-- Settings per user
CREATE TABLE public.penny_stock_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  paper_only boolean NOT NULL DEFAULT true,
  emergency_paused boolean NOT NULL DEFAULT false,
  max_price numeric NOT NULL DEFAULT 1.00,
  min_volume numeric NOT NULL DEFAULT 500000,
  min_relative_volume numeric NOT NULL DEFAULT 2,
  min_float numeric NOT NULL DEFAULT 1000000,
  max_float numeric NOT NULL DEFAULT 50000000,
  min_market_cap numeric NOT NULL DEFAULT 5000000,
  max_market_cap numeric NOT NULL DEFAULT 500000000,
  allowed_exchanges text[] NOT NULL DEFAULT ARRAY['NASDAQ','NYSE','AMEX'],
  allow_otc boolean NOT NULL DEFAULT false,
  max_spread_percent numeric NOT NULL DEFAULT 2.0,
  max_risk_per_trade_pct numeric NOT NULL DEFAULT 0.5,
  daily_loss_limit_pct numeric NOT NULL DEFAULT 2.0,
  consecutive_loss_pause integer NOT NULL DEFAULT 2,
  no_overnight_holds boolean NOT NULL DEFAULT true,
  block_during_halts boolean NOT NULL DEFAULT true,
  min_score integer NOT NULL DEFAULT 80,
  min_risk_reward numeric NOT NULL DEFAULT 2.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.penny_stock_settings TO authenticated;
GRANT ALL ON public.penny_stock_settings TO service_role;

ALTER TABLE public.penny_stock_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own penny settings" ON public.penny_stock_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own penny settings" ON public.penny_stock_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own penny settings" ON public.penny_stock_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own penny settings" ON public.penny_stock_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Public scanner results
CREATE TABLE public.penny_stock_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  company_name text,
  exchange text NOT NULL DEFAULT 'NASDAQ',
  price numeric NOT NULL,
  change_percent numeric,
  volume numeric,
  relative_volume numeric,
  float_shares numeric,
  market_cap numeric,
  spread_percent numeric,
  bid numeric,
  ask numeric,
  vwap numeric,
  ema_trend text,
  catalyst text,
  setup_type text,
  score numeric NOT NULL DEFAULT 0,
  factor_scores jsonb,
  warnings text[] DEFAULT '{}',
  valid boolean NOT NULL DEFAULT false,
  risk_reward numeric,
  suggested_stop numeric,
  suggested_target numeric,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_penny_signals_scanned_at ON public.penny_stock_signals(scanned_at DESC);
CREATE INDEX idx_penny_signals_score ON public.penny_stock_signals(score DESC);

GRANT SELECT ON public.penny_stock_signals TO anon, authenticated;
GRANT ALL ON public.penny_stock_signals TO service_role;

ALTER TABLE public.penny_stock_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view penny signals" ON public.penny_stock_signals
  FOR SELECT USING (true);

-- Paper trades
CREATE TABLE public.penny_stock_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL DEFAULT 'buy',
  quantity numeric NOT NULL,
  entry_price numeric NOT NULL,
  exit_price numeric,
  stop_loss numeric,
  take_profit numeric,
  pnl numeric,
  pnl_percent numeric,
  slippage numeric DEFAULT 0,
  spread_cost numeric DEFAULT 0,
  volume_at_entry numeric,
  strategy text,
  entry_reason text,
  exit_reason text,
  status text NOT NULL DEFAULT 'open',
  is_paper boolean NOT NULL DEFAULT true,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_penny_trades_user_opened ON public.penny_stock_trades(user_id, opened_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.penny_stock_trades TO authenticated;
GRANT ALL ON public.penny_stock_trades TO service_role;

ALTER TABLE public.penny_stock_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own penny trades" ON public.penny_stock_trades
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own penny trades" ON public.penny_stock_trades
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own penny trades" ON public.penny_stock_trades
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own penny trades" ON public.penny_stock_trades
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Trigger to keep updated_at fresh
CREATE TRIGGER trg_penny_settings_updated
  BEFORE UPDATE ON public.penny_stock_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_penny_trades_updated
  BEFORE UPDATE ON public.penny_stock_trades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

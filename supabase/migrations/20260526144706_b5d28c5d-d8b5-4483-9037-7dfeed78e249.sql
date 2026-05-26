
-- LEVERAGE SETTINGS
CREATE TABLE public.leverage_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  paper_enabled boolean NOT NULL DEFAULT true,
  live_enabled boolean NOT NULL DEFAULT false,
  live_confirmed_by_admin uuid,
  live_confirmed_at timestamptz,
  paper_max_leverage numeric NOT NULL DEFAULT 5,
  live_max_leverage numeric NOT NULL DEFAULT 0,
  max_leverage_cap numeric NOT NULL DEFAULT 10,
  default_leverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  margin_mode text NOT NULL DEFAULT 'isolated',
  cross_margin_enabled boolean NOT NULL DEFAULT false,
  max_risk_per_trade_pct numeric NOT NULL DEFAULT 1.0,
  max_daily_loss_pct numeric NOT NULL DEFAULT 3.0,
  min_confidence numeric NOT NULL DEFAULT 80,
  min_risk_reward numeric NOT NULL DEFAULT 1.5,
  consecutive_losses_pause integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.leverage_settings TO authenticated;
GRANT ALL ON public.leverage_settings TO service_role;

ALTER TABLE public.leverage_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own leverage settings" ON public.leverage_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own leverage settings" ON public.leverage_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own leverage settings" ON public.leverage_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Trigger: only admin can flip live_enabled true
CREATE OR REPLACE FUNCTION public.enforce_live_leverage_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.live_enabled = true AND (OLD.live_enabled IS DISTINCT FROM true) THEN
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only admins can enable live leverage trading';
    END IF;
    NEW.live_confirmed_by_admin := auth.uid();
    NEW.live_confirmed_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_live_leverage
BEFORE UPDATE ON public.leverage_settings
FOR EACH ROW EXECUTE FUNCTION public.enforce_live_leverage_admin();

-- FUTURES POSITIONS
CREATE TABLE public.futures_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('long','short')),
  quantity numeric NOT NULL,
  entry_price numeric NOT NULL,
  stop_loss numeric,
  take_profit numeric,
  leverage numeric NOT NULL,
  margin_used numeric NOT NULL,
  position_value numeric NOT NULL,
  estimated_liquidation_price numeric,
  estimated_fees numeric DEFAULT 0,
  margin_mode text NOT NULL DEFAULT 'isolated',
  is_paper boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','liquidated')),
  pnl numeric,
  exit_price numeric,
  exchange text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.futures_positions TO authenticated;
GRANT ALL ON public.futures_positions TO service_role;
ALTER TABLE public.futures_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own futures positions" ON public.futures_positions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own futures positions" ON public.futures_positions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own futures positions" ON public.futures_positions
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- LIQUIDATION ESTIMATES
CREATE TABLE public.liquidation_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL,
  entry_price numeric NOT NULL,
  stop_loss numeric NOT NULL,
  leverage numeric NOT NULL,
  margin_required numeric NOT NULL,
  estimated_liquidation_price numeric NOT NULL,
  distance_to_liquidation_pct numeric NOT NULL,
  distance_to_stop_pct numeric NOT NULL,
  safe boolean NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.liquidation_estimates TO authenticated;
GRANT ALL ON public.liquidation_estimates TO service_role;
ALTER TABLE public.liquidation_estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own liq estimates" ON public.liquidation_estimates
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own liq estimates" ON public.liquidation_estimates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- MARGIN LOGS
CREATE TABLE public.margin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  position_id uuid,
  action text NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.margin_logs TO authenticated;
GRANT ALL ON public.margin_logs TO service_role;
ALTER TABLE public.margin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own margin logs" ON public.margin_logs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own margin logs" ON public.margin_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- FUTURES API CONNECTIONS (placeholder)
CREATE TABLE public.futures_api_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exchange text NOT NULL CHECK (exchange IN ('binance_futures','bybit','kraken_futures','coinbase_advanced')),
  api_key_hint text,
  read_only boolean NOT NULL DEFAULT true,
  paper_mode boolean NOT NULL DEFAULT true,
  live_locked boolean NOT NULL DEFAULT true,
  is_connected boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, exchange)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.futures_api_connections TO authenticated;
GRANT ALL ON public.futures_api_connections TO service_role;
ALTER TABLE public.futures_api_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own futures api" ON public.futures_api_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own futures api" ON public.futures_api_connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own futures api" ON public.futures_api_connections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own futures api" ON public.futures_api_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

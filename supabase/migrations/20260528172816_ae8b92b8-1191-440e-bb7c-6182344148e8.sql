
-- 1. Usage log
CREATE TABLE public.ai_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  model text,
  cost_usd numeric NOT NULL DEFAULT 0,
  tokens_in integer DEFAULT 0,
  tokens_out integer DEFAULT 0,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ai usage"
  ON public.ai_usage_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX idx_ai_usage_user_created ON public.ai_usage_log (user_id, created_at DESC);

-- 2. In-app credit balances
CREATE TABLE public.ai_credit_balances (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_credit_balances TO authenticated;
GRANT ALL ON public.ai_credit_balances TO service_role;
ALTER TABLE public.ai_credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credit balance"
  ON public.ai_credit_balances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 3. Credit transaction log
CREATE TABLE public.ai_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta numeric NOT NULL,
  type text NOT NULL,             -- 'purchase' | 'debit' | 'bonus' | 'refund'
  description text,
  stripe_session_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_credit_transactions TO authenticated;
GRANT ALL ON public.ai_credit_transactions TO service_role;
ALTER TABLE public.ai_credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own credit txns"
  ON public.ai_credit_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE INDEX idx_ai_credit_txns_user ON public.ai_credit_transactions (user_id, created_at DESC);

-- 4. Monthly budget setting (default $25/mo)
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS ai_monthly_budget_usd numeric NOT NULL DEFAULT 25;

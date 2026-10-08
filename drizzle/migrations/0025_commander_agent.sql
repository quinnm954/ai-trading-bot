ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS commander_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS risk_controlled_by text NOT NULL DEFAULT 'commander',
  ADD COLUMN IF NOT EXISTS hard_floor_pct numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS commander_paused_reason text;

CREATE TABLE public.commander_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  agent text NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'issued',
  result jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commander_orders_user_idx ON public.commander_orders (user_id, created_at DESC);
GRANT SELECT ON public.commander_orders TO authenticated;
GRANT ALL ON public.commander_orders TO service_role;
ALTER TABLE public.commander_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read commander orders" ON public.commander_orders FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.commander_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  equity numeric NOT NULL,
  pnl_since_start numeric NOT NULL,
  pnl_per_hour numeric,
  max_drawdown numeric,
  plan text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commander_scores_user_idx ON public.commander_scores (user_id, created_at DESC);
GRANT SELECT ON public.commander_scores TO authenticated;
GRANT ALL ON public.commander_scores TO service_role;
ALTER TABLE public.commander_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read commander scores" ON public.commander_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);
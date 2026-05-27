
-- Dynamic grid layouts (per-user, per-symbol)
CREATE TABLE public.grid_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  regime TEXT,
  center_price NUMERIC NOT NULL,
  spacing NUMERIC NOT NULL,
  atr NUMERIC,
  levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  upper_bound NUMERIC,
  lower_bound NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grid_layouts TO authenticated;
GRANT ALL ON public.grid_layouts TO service_role;

ALTER TABLE public.grid_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own grid layouts" ON public.grid_layouts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own grid layouts" ON public.grid_layouts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own grid layouts" ON public.grid_layouts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own grid layouts" ON public.grid_layouts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_grid_layouts_user_symbol ON public.grid_layouts(user_id, symbol);

-- Liquidation map (global, market-wide)
CREATE TABLE public.liquidation_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  price_level NUMERIC NOT NULL,
  side TEXT NOT NULL, -- 'long' or 'short' (positions that would be liquidated)
  cluster_size_usd NUMERIC NOT NULL DEFAULT 0,
  position_count INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'internal', -- 'internal' | 'external'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.liquidation_map TO anon;
GRANT SELECT ON public.liquidation_map TO authenticated;
GRANT ALL ON public.liquidation_map TO service_role;

ALTER TABLE public.liquidation_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view liquidation map" ON public.liquidation_map
  FOR SELECT USING (true);

CREATE INDEX idx_liquidation_map_symbol ON public.liquidation_map(symbol, cluster_size_usd DESC);
CREATE INDEX idx_liquidation_map_updated ON public.liquidation_map(updated_at DESC);

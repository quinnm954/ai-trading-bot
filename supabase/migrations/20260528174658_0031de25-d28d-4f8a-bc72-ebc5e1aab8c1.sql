CREATE TABLE public.symbol_cooldowns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'audit',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_symbol_cooldowns_user_active
  ON public.symbol_cooldowns (user_id, symbol, expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.symbol_cooldowns TO authenticated;
GRANT ALL ON public.symbol_cooldowns TO service_role;

ALTER TABLE public.symbol_cooldowns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own symbol cooldowns"
  ON public.symbol_cooldowns FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own symbol cooldowns"
  ON public.symbol_cooldowns FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own symbol cooldowns"
  ON public.symbol_cooldowns FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
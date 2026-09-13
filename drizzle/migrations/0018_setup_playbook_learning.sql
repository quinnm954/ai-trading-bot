-- Entry playbook context on each trade (additive, nullable)
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS setup_key TEXT;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS playbook_score NUMERIC;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS playbook_grade TEXT;

-- Self-learning scorecard: outcome statistics per setup fingerprint
CREATE TABLE IF NOT EXISTS public.setup_scorecard (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  setup_key TEXT NOT NULL,
  regime TEXT,
  strategy TEXT,
  grade TEXT,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  samples INTEGER NOT NULL DEFAULT 0,
  net_pnl NUMERIC NOT NULL DEFAULT 0,
  gross_win NUMERIC NOT NULL DEFAULT 0,
  gross_loss NUMERIC NOT NULL DEFAULT 0,
  benched BOOLEAN NOT NULL DEFAULT false,
  benched_at TIMESTAMP WITH TIME ZONE,
  last_outcome TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, setup_key)
);

GRANT SELECT ON public.setup_scorecard TO authenticated;
GRANT ALL ON public.setup_scorecard TO service_role;

ALTER TABLE public.setup_scorecard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own setup scorecard"
ON public.setup_scorecard FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_setup_scorecard_user ON public.setup_scorecard (user_id, setup_key);

-- Record one closed-trade outcome against its setup fingerprint and auto-bench
-- fingerprints that prove negative expectancy over a meaningful sample.
CREATE OR REPLACE FUNCTION public.record_setup_outcome(
  p_user_id UUID,
  p_setup_key TEXT,
  p_pnl NUMERIC,
  p_regime TEXT DEFAULT NULL,
  p_strategy TEXT DEFAULT NULL,
  p_grade TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_win BOOLEAN := COALESCE(p_pnl, 0) > 0;
BEGIN
  IF p_user_id IS NULL OR p_setup_key IS NULL OR p_setup_key = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.setup_scorecard AS s (
    user_id, setup_key, regime, strategy, grade,
    wins, losses, samples, net_pnl, gross_win, gross_loss, last_outcome, updated_at
  ) VALUES (
    p_user_id, p_setup_key, p_regime, p_strategy, p_grade,
    CASE WHEN v_win THEN 1 ELSE 0 END,
    CASE WHEN v_win THEN 0 ELSE 1 END,
    1,
    COALESCE(p_pnl, 0),
    CASE WHEN v_win THEN COALESCE(p_pnl, 0) ELSE 0 END,
    CASE WHEN v_win THEN 0 ELSE ABS(COALESCE(p_pnl, 0)) END,
    CASE WHEN v_win THEN 'win' ELSE 'loss' END,
    now()
  )
  ON CONFLICT (user_id, setup_key) DO UPDATE SET
    wins = s.wins + CASE WHEN v_win THEN 1 ELSE 0 END,
    losses = s.losses + CASE WHEN v_win THEN 0 ELSE 1 END,
    samples = s.samples + 1,
    net_pnl = s.net_pnl + COALESCE(p_pnl, 0),
    gross_win = s.gross_win + CASE WHEN v_win THEN COALESCE(p_pnl, 0) ELSE 0 END,
    gross_loss = s.gross_loss + CASE WHEN v_win THEN 0 ELSE ABS(COALESCE(p_pnl, 0)) END,
    regime = COALESCE(s.regime, p_regime),
    strategy = COALESCE(s.strategy, p_strategy),
    grade = COALESCE(s.grade, p_grade),
    last_outcome = CASE WHEN v_win THEN 'win' ELSE 'loss' END,
    updated_at = now();

  -- Bench a fingerprint that is losing money over at least 8 closed trades.
  UPDATE public.setup_scorecard
  SET benched = true,
      benched_at = COALESCE(benched_at, now())
  WHERE user_id = p_user_id
    AND setup_key = p_setup_key
    AND samples >= 8
    AND net_pnl < 0
    AND (wins::numeric / GREATEST(samples, 1)) < 0.40;

  -- Un-bench once it proves itself again (net positive over a fresh sample).
  UPDATE public.setup_scorecard
  SET benched = false,
      benched_at = NULL
  WHERE user_id = p_user_id
    AND setup_key = p_setup_key
    AND benched = true
    AND net_pnl > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_setup_outcome(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO service_role;
-- ═══════════════════════════════════════════════════════════════════════════
-- Backtesting pipeline: historical candle cache + resumable job tracking.
-- Evaluation-only infrastructure. Nothing here is read by the live trading path.
-- ═══════════════════════════════════════════════════════════════════════════

-- Shared historical candle cache. Fetched once from Coinbase, replayed many times
-- so any future parameter change can be validated in seconds instead of hours.
CREATE TABLE public.backtest_candles (
  product_id text NOT NULL,
  granularity text NOT NULL,
  bucket_start bigint NOT NULL,
  open numeric NOT NULL,
  high numeric NOT NULL,
  low numeric NOT NULL,
  close numeric NOT NULL,
  volume numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, granularity, bucket_start)
);

CREATE INDEX idx_backtest_candles_lookup
  ON public.backtest_candles (product_id, granularity, bucket_start DESC);

GRANT SELECT ON public.backtest_candles TO authenticated;
GRANT ALL ON public.backtest_candles TO service_role;

ALTER TABLE public.backtest_candles ENABLE ROW LEVEL SECURITY;

-- Reference market data: readable by any signed-in user, written only by the
-- backtest function via the service role.
CREATE POLICY "Authenticated users can read cached candles"
  ON public.backtest_candles FOR SELECT TO authenticated USING (true);


-- One row per requested backtest run. Chunked/resumable: the function processes a
-- slice of work per invocation and advances the phase + cursors here.
CREATE TABLE public.backtest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  run_group_id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text,
  phase text NOT NULL DEFAULT 'pending',
  universe text[] NOT NULL DEFAULT '{}',
  period_days integer NOT NULL DEFAULT 90,
  range_start timestamptz,
  range_end timestamptz,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_cursor integer NOT NULL DEFAULT 0,
  replay_cursor integer NOT NULL DEFAULT 0,
  candles_loaded bigint NOT NULL DEFAULT 0,
  symbols_replayed integer NOT NULL DEFAULT 0,
  progress_note text,
  summary jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT backtest_jobs_phase_check
    CHECK (phase IN ('pending', 'syncing', 'replaying', 'done', 'failed'))
);

CREATE INDEX idx_backtest_jobs_user ON public.backtest_jobs (user_id, created_at DESC);
CREATE INDEX idx_backtest_jobs_group ON public.backtest_jobs (run_group_id);

GRANT SELECT, INSERT, UPDATE ON public.backtest_jobs TO authenticated;
GRANT ALL ON public.backtest_jobs TO service_role;

ALTER TABLE public.backtest_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own backtest jobs"
  ON public.backtest_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own backtest jobs"
  ON public.backtest_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own backtest jobs"
  ON public.backtest_jobs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_backtest_jobs_updated_at
  BEFORE UPDATE ON public.backtest_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
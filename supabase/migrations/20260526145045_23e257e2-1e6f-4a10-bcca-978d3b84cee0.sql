
-- ============ EXTEND EXISTING TABLES ============
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS fees_estimate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slippage_estimate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS risk_reward numeric,
  ADD COLUMN IF NOT EXISTS entry_reasoning text,
  ADD COLUMN IF NOT EXISTS stop_loss_price numeric,
  ADD COLUMN IF NOT EXISTS take_profit_price numeric;

ALTER TABLE public.ai_decisions
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS factor_scores jsonb,
  ADD COLUMN IF NOT EXISTS risk_reward numeric,
  ADD COLUMN IF NOT EXISTS valid boolean DEFAULT false;

ALTER TABLE public.strategy_performance
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_drawdown numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profit_factor numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS best_trade numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worst_trade numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_win numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_loss numeric DEFAULT 0;

-- ============ SIGNAL SCORES ============
CREATE TABLE public.signal_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  strategy text,
  action text,
  trend_score numeric NOT NULL DEFAULT 0,
  ema_alignment_score numeric NOT NULL DEFAULT 0,
  rsi_score numeric NOT NULL DEFAULT 0,
  macd_score numeric NOT NULL DEFAULT 0,
  vwap_score numeric NOT NULL DEFAULT 0,
  volume_score numeric NOT NULL DEFAULT 0,
  sr_score numeric NOT NULL DEFAULT 0,
  volatility_score numeric NOT NULL DEFAULT 0,
  risk_reward_score numeric NOT NULL DEFAULT 0,
  total_score numeric NOT NULL DEFAULT 0,
  risk_reward numeric,
  valid boolean NOT NULL DEFAULT false,
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.signal_scores TO authenticated;
GRANT ALL ON public.signal_scores TO service_role;
ALTER TABLE public.signal_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own signal scores" ON public.signal_scores
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own signal scores" ON public.signal_scores
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_signal_scores_user_created ON public.signal_scores(user_id, created_at DESC);

-- ============ BACKTEST RUNS ============
CREATE TABLE public.backtest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  strategy text NOT NULL,
  timeframe text NOT NULL,
  period_days integer NOT NULL DEFAULT 30,
  initial_balance numeric NOT NULL DEFAULT 10000,
  ending_balance numeric NOT NULL DEFAULT 10000,
  total_return numeric NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  max_drawdown numeric NOT NULL DEFAULT 0,
  profit_factor numeric NOT NULL DEFAULT 0,
  trades_count integer NOT NULL DEFAULT 0,
  best_trade numeric NOT NULL DEFAULT 0,
  worst_trade numeric NOT NULL DEFAULT 0,
  avg_win numeric NOT NULL DEFAULT 0,
  avg_loss numeric NOT NULL DEFAULT 0,
  sharpe numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.backtest_runs TO authenticated;
GRANT ALL ON public.backtest_runs TO service_role;
ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own backtests" ON public.backtest_runs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own backtests" ON public.backtest_runs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_backtest_runs_user_created ON public.backtest_runs(user_id, created_at DESC);

-- ============ TRADE JOURNAL NOTES ============
CREATE TABLE public.trade_journal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trade_id uuid,
  note text NOT NULL,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_journal_notes TO authenticated;
GRANT ALL ON public.trade_journal_notes TO service_role;
ALTER TABLE public.trade_journal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own journal notes" ON public.trade_journal_notes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own journal notes" ON public.trade_journal_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own journal notes" ON public.trade_journal_notes
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own journal notes" ON public.trade_journal_notes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

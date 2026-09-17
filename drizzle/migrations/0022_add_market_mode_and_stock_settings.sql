-- Market mode: which asset class an account actively trades.
ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS market_mode TEXT NOT NULL DEFAULT 'crypto',
  ADD COLUMN IF NOT EXISTS stock_cash_account BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stock_max_intraday_exposure_pct NUMERIC NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS stock_stop_atr_mult NUMERIC NOT NULL DEFAULT 1.2,
  ADD COLUMN IF NOT EXISTS stock_max_stop_pct NUMERIC NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS stock_min_stop_pct NUMERIC NOT NULL DEFAULT 0.4,
  ADD COLUMN IF NOT EXISTS stock_allow_extended_hours BOOLEAN NOT NULL DEFAULT false;

-- Only ever one of the two supported modes.
ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_market_mode_check;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_market_mode_check
  CHECK (market_mode IN ('crypto', 'stocks'));

-- Cached historical bars for the backtest pipeline need an asset-class dimension so
-- stock bars never collide with the crypto candle rows already cached.
ALTER TABLE public.backtest_candles
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto';

ALTER TABLE public.backtest_jobs
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto';

ALTER TABLE public.backtest_runs
  ADD COLUMN IF NOT EXISTS asset_class TEXT NOT NULL DEFAULT 'crypto';
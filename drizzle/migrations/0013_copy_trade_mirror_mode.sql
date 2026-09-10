ALTER TABLE public.copy_trading_settings
  ADD COLUMN IF NOT EXISTS risk_acknowledged boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS risk_acknowledged_at timestamptz;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS mirror_only boolean NOT NULL DEFAULT false;
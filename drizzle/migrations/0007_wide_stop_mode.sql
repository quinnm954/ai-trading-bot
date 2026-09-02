ALTER TABLE public.scalp_settings
  ADD COLUMN IF NOT EXISTS wide_stop_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS stop_loss_pct numeric,
  ADD COLUMN IF NOT EXISTS take_profit_pct numeric,
  ADD COLUMN IF NOT EXISTS max_hold_minutes integer,
  ADD COLUMN IF NOT EXISTS trailing_enabled boolean NOT NULL DEFAULT true;
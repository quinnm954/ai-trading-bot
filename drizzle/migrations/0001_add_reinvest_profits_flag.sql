ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS reinvest_profits boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ai_settings.reinvest_profits IS
  'When false (default), position sizing is based on the initial deposit only — realized profits are held aside as cash and never redeployed. When true, sizing uses full account equity.';
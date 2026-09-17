ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS stock_playbook_min_score numeric,
  ADD COLUMN IF NOT EXISTS stock_playbook_min_rvol numeric,
  ADD COLUMN IF NOT EXISTS stock_playbook_min_rs_day_pct numeric,
  ADD COLUMN IF NOT EXISTS stock_playbook_max_extension_mult numeric,
  ADD COLUMN IF NOT EXISTS stock_earnings_buffer_days integer,
  ADD COLUMN IF NOT EXISTS stock_tape_min_index_pct numeric,
  ADD COLUMN IF NOT EXISTS stock_tape_min_breadth numeric;

COMMENT ON COLUMN public.ai_settings.stock_playbook_min_score IS 'Equity playbook conviction floor (default 62).';
COMMENT ON COLUMN public.ai_settings.stock_playbook_min_rvol IS 'Minimum relative volume vs the stock''s own same-time-of-day average (default 1.15).';
COMMENT ON COLUMN public.ai_settings.stock_earnings_buffer_days IS 'Block entries when scheduled earnings are within this many days (default 3).';
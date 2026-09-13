ALTER TABLE public.scalp_settings
  ADD COLUMN IF NOT EXISTS playbook_min_score numeric NOT NULL DEFAULT 55,
  ADD COLUMN IF NOT EXISTS playbook_min_volume_ratio numeric NOT NULL DEFAULT 0.6,
  ADD COLUMN IF NOT EXISTS playbook_max_percent_b numeric NOT NULL DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS playbook_rsi_max numeric NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS playbook_max_chase_5m_pct numeric NOT NULL DEFAULT 3;
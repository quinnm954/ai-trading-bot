ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS partial_tp_done boolean NOT NULL DEFAULT false;

-- Apply the current wide-mode contract to already-open wide swings so existing
-- holdings get the new trailing behaviour immediately.
UPDATE public.positions
SET take_profit_pct = 4.0,
    stop_loss_pct = 1.2,
    trailing_enabled = true,
    updated_at = now()
WHERE max_hold_minutes >= 2880;
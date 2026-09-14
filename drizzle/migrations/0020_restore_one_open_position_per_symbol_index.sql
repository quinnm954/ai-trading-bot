-- Restore the guard the engine relies on: only one OPEN position per user/symbol/mode.
-- Remove existing duplicates first (keep the earliest open row per group).
DELETE FROM public.trades t
USING (
  SELECT id, row_number() OVER (PARTITION BY user_id, symbol, is_paper ORDER BY created_at) AS rn
  FROM public.trades
  WHERE status = 'open'
) d
WHERE t.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS trades_one_open_per_symbol_mode
  ON public.trades (user_id, symbol, is_paper)
  WHERE status = 'open';
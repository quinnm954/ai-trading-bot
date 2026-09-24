ALTER TABLE public.top_traders
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'hyperliquid',
  ADD COLUMN IF NOT EXISTS external_handle text,
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;
ALTER TABLE public.top_traders ALTER COLUMN win_rate DROP DEFAULT;
CREATE INDEX IF NOT EXISTS top_traders_source_idx ON public.top_traders(source);
-- FOMO replaces Hyperliquid as the copy source: stop copying Hyperliquid traders.
UPDATE public.followed_traders f SET is_active = false
  FROM public.top_traders t WHERE t.id = f.trader_id AND t.source = 'hyperliquid';
UPDATE public.copy_trade_signals s SET status = 'skipped_source_retired'
  FROM public.top_traders t WHERE t.id = s.trader_id AND t.source = 'hyperliquid' AND s.status = 'pending';
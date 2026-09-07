-- One position per coin per mode, enforced at the database level.
-- The engine's pre-insert SELECT cannot stop two cycles firing in the same second,
-- which caused every losing idea to be opened twice at double size.
CREATE UNIQUE INDEX IF NOT EXISTS positions_one_per_symbol_per_mode
  ON public.positions (user_id, symbol, is_paper);
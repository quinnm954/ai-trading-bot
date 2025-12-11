-- Add unique constraint on symbol column for moonshot_signals table
ALTER TABLE public.moonshot_signals ADD CONSTRAINT moonshot_signals_symbol_key UNIQUE (symbol);
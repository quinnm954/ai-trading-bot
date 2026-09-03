-- Wide-stop swing mode becomes the default entry geometry (8% TP / 2.5xATR stop / 48h hold),
-- still gated by the aggregate tape read. The 60-day walk-forward on real Coinbase candles
-- showed the locked 3.36%/0.80% pair books a stop inside one ATR of noise, while the wide
-- pair turns positive once the entry-quality gates are applied.
ALTER TABLE public.scalp_settings
  ALTER COLUMN wide_stop_mode SET DEFAULT true;

UPDATE public.scalp_settings SET wide_stop_mode = true WHERE wide_stop_mode = false;
-- Add peak PnL tracking to positions for trailing stop
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS peak_pnl_percent numeric DEFAULT 0;

-- Add comment explaining the column
COMMENT ON COLUMN public.positions.peak_pnl_percent IS 'Tracks the highest PnL percentage achieved for trailing stop protection';
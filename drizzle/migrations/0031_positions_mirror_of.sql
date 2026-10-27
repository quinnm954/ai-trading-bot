ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS mirror_of uuid;
CREATE INDEX IF NOT EXISTS idx_positions_mirror_of ON public.positions (mirror_of) WHERE mirror_of IS NOT NULL;
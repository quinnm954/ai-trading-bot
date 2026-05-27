ALTER TABLE public.ai_settings
ADD COLUMN IF NOT EXISTS meme_coins_only boolean NOT NULL DEFAULT false;
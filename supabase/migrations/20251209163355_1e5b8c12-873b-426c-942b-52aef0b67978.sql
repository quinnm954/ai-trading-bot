-- Add leverage and AI autonomy settings
ALTER TABLE public.ai_settings 
ADD COLUMN IF NOT EXISTS max_leverage numeric DEFAULT 3,
ADD COLUMN IF NOT EXISTS ai_autonomous_mode boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS target_equity numeric DEFAULT 1000000,
ADD COLUMN IF NOT EXISTS risk_tolerance text DEFAULT 'aggressive';
-- Create moonshot_signals table for storing pump probability scores
CREATE TABLE public.moonshot_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  name TEXT,
  pump_probability NUMERIC NOT NULL DEFAULT 0,
  volume_score NUMERIC NOT NULL DEFAULT 0,
  liquidity_score NUMERIC NOT NULL DEFAULT 0,
  sentiment_score NUMERIC NOT NULL DEFAULT 0,
  whale_score NUMERIC NOT NULL DEFAULT 0,
  technical_score NUMERIC NOT NULL DEFAULT 0,
  price_usd NUMERIC,
  volume_24h NUMERIC,
  price_change_24h NUMERIC,
  signal_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_moonshot_signals_pump_probability ON public.moonshot_signals (pump_probability DESC);
CREATE INDEX idx_moonshot_signals_symbol ON public.moonshot_signals (symbol);
CREATE INDEX idx_moonshot_signals_updated_at ON public.moonshot_signals (updated_at DESC);

-- Enable RLS
ALTER TABLE public.moonshot_signals ENABLE ROW LEVEL SECURITY;

-- Public read access (all users can view moonshot signals)
CREATE POLICY "Anyone can view moonshot signals" 
ON public.moonshot_signals 
FOR SELECT 
USING (true);

-- Only service role can insert/update (edge functions)
CREATE POLICY "Service role can insert moonshot signals" 
ON public.moonshot_signals 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role can update moonshot signals" 
ON public.moonshot_signals 
FOR UPDATE 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_moonshot_signals_updated_at
BEFORE UPDATE ON public.moonshot_signals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add moonshot preference to ai_settings
ALTER TABLE public.ai_settings 
ADD COLUMN IF NOT EXISTS prioritize_moonshots BOOLEAN DEFAULT false;
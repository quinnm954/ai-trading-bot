-- Add trading_mode column to ai_settings to track paper vs live
ALTER TABLE public.ai_settings 
ADD COLUMN IF NOT EXISTS trading_mode text NOT NULL DEFAULT 'paper' CHECK (trading_mode IN ('paper', 'live'));

-- Add is_paper column to trades table to distinguish paper vs live trades
ALTER TABLE public.trades 
ADD COLUMN IF NOT EXISTS is_paper boolean NOT NULL DEFAULT true;

-- Add is_paper column to positions table
ALTER TABLE public.positions 
ADD COLUMN IF NOT EXISTS is_paper boolean NOT NULL DEFAULT true;

-- Create a live_account table to track real money from connected brokers
CREATE TABLE IF NOT EXISTS public.live_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('alpaca', 'coinbase')),
  balance numeric NOT NULL DEFAULT 0,
  buying_power numeric NOT NULL DEFAULT 0,
  equity numeric NOT NULL DEFAULT 0,
  last_synced_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Enable RLS on live_account
ALTER TABLE public.live_account ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for live_account
CREATE POLICY "Users can view own live account" 
ON public.live_account 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own live account" 
ON public.live_account 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own live account" 
ON public.live_account 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_live_account_updated_at
BEFORE UPDATE ON public.live_account
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
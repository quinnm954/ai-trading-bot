-- Create broker_credentials table for secure per-user API credential storage
-- PATENT REFERENCE: No Custody of User Funds (Patent Claim 5)
-- Users store their broker credentials securely for TitanAI to trade on their behalf

CREATE TABLE public.broker_credentials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL,
  -- Credentials are stored encrypted (Supabase handles encryption at rest)
  api_key_encrypted TEXT NOT NULL,
  secret_key_encrypted TEXT,
  passphrase_encrypted TEXT,
  access_token_encrypted TEXT,
  -- Metadata
  is_paper BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Ensure one credential set per provider per user
  UNIQUE(user_id, provider)
);

-- Enable Row Level Security
ALTER TABLE public.broker_credentials ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only user can access their own credentials
CREATE POLICY "Users can view own broker credentials" 
ON public.broker_credentials 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own broker credentials" 
ON public.broker_credentials 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own broker credentials" 
ON public.broker_credentials 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own broker credentials" 
ON public.broker_credentials 
FOR DELETE 
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_broker_credentials_updated_at
BEFORE UPDATE ON public.broker_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE public.broker_credentials IS 'Encrypted storage for user broker API credentials. TitanAI never holds custody of funds - these credentials allow trading on user-owned broker accounts.';
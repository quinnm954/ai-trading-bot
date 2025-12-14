-- Add execution_mode to ai_settings (autonomous vs user_confirmed)
ALTER TABLE public.ai_settings 
ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'autonomous';

-- Create pending_trades table for user-confirmed mode
CREATE TABLE public.pending_trades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  symbol text NOT NULL,
  side text NOT NULL CHECK (side IN ('buy', 'sell')),
  quantity numeric NOT NULL,
  price numeric NOT NULL,
  position_value numeric NOT NULL,
  strategy text,
  ai_reasoning text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0,
  market_regime text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  reviewed_at timestamp with time zone,
  review_notes text
);

-- Enable RLS
ALTER TABLE public.pending_trades ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own pending trades"
ON public.pending_trades FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pending trades"
ON public.pending_trades FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending trades"
ON public.pending_trades FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending trades"
ON public.pending_trades FOR DELETE
USING (auth.uid() = user_id);

-- Index for efficient queries
CREATE INDEX idx_pending_trades_user_status ON public.pending_trades(user_id, status);
CREATE INDEX idx_pending_trades_expires ON public.pending_trades(expires_at) WHERE status = 'pending';

-- Add comment for patent documentation
COMMENT ON TABLE public.pending_trades IS 'Patent Claim: Selectable Execution Control Modes - Stores trade proposals awaiting user confirmation in user-confirmed execution mode';
COMMENT ON COLUMN public.ai_settings.execution_mode IS 'Patent Claim: Selectable Execution Control Modes - autonomous (AI executes directly) or user_confirmed (user must approve each trade)';
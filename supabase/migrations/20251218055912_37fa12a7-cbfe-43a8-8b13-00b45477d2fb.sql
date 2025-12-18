-- Create table for storing user's followed traders
CREATE TABLE public.followed_traders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trader_id uuid REFERENCES public.top_traders(id) ON DELETE CASCADE NOT NULL,
  followed_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  copy_percentage numeric DEFAULT 10 CHECK (copy_percentage >= 1 AND copy_percentage <= 100),
  max_copy_amount_usd numeric DEFAULT 100,
  UNIQUE (user_id, trader_id)
);

-- Enable RLS
ALTER TABLE public.followed_traders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own followed traders"
ON public.followed_traders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can follow traders"
ON public.followed_traders FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own followed traders"
ON public.followed_traders FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can unfollow traders"
ON public.followed_traders FOR DELETE
USING (auth.uid() = user_id);

-- Add index for faster lookups
CREATE INDEX idx_followed_traders_user_id ON public.followed_traders(user_id);
CREATE INDEX idx_followed_traders_trader_id ON public.followed_traders(trader_id);
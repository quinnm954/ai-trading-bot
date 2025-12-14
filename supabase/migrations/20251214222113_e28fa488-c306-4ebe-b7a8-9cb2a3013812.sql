-- Create subscriptions table to store subscription status locally
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only view their own subscription
CREATE POLICY "Users can view own subscription"
ON public.subscriptions
FOR SELECT
USING (auth.uid() = user_id);

-- Only service role can insert/update (webhook handles this)
CREATE POLICY "Service role can insert subscriptions"
ON public.subscriptions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update subscriptions"
ON public.subscriptions
FOR UPDATE
USING (true);

-- Prevent user deletion of subscription records
CREATE POLICY "Subscriptions cannot be deleted"
ON public.subscriptions
FOR DELETE
USING (false);

-- Create index for faster lookups
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);

-- Add trigger for updated_at
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to check subscription tier
CREATE OR REPLACE FUNCTION public.get_user_subscription_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    -- First check if user has free access via invite/admin
    (SELECT 'unlimited' FROM public.user_roles WHERE user_id = p_user_id AND has_free_access = true LIMIT 1),
    -- Then check active subscription
    (SELECT tier FROM public.subscriptions 
     WHERE user_id = p_user_id 
     AND status = 'active' 
     AND (current_period_end IS NULL OR current_period_end > now())
     LIMIT 1),
    -- Default to free
    'free'
  )
$$;

-- Create function to check if user can use feature
CREATE OR REPLACE FUNCTION public.can_use_feature(p_user_id UUID, p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_tier TEXT;
BEGIN
  user_tier := get_user_subscription_tier(p_user_id);
  
  -- Define feature access by tier
  CASE p_feature
    -- Free tier features
    WHEN 'paper_trading' THEN RETURN true;
    WHEN 'ai_advisor' THEN RETURN true;
    WHEN 'basic_strategies' THEN RETURN true;
    
    -- Pro tier features (pro and unlimited)
    WHEN 'live_trading' THEN RETURN user_tier IN ('pro', 'unlimited');
    WHEN 'single_broker' THEN RETURN user_tier IN ('pro', 'unlimited');
    WHEN 'autonomous_trading' THEN RETURN user_tier IN ('pro', 'unlimited');
    WHEN 'risk_management' THEN RETURN user_tier IN ('pro', 'unlimited');
    
    -- Unlimited tier features
    WHEN 'unlimited_brokers' THEN RETURN user_tier = 'unlimited';
    WHEN 'moonshot_scanner' THEN RETURN user_tier = 'unlimited';
    WHEN 'ai_learning_engine' THEN RETURN user_tier = 'unlimited';
    WHEN 'priority_support' THEN RETURN user_tier = 'unlimited';
    
    ELSE RETURN false;
  END CASE;
END;
$$;
-- Create table to store referral codes for marketers
CREATE TABLE public.referral_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  marketer_name text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  is_active boolean DEFAULT true
);

-- Enable RLS
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Only admins can manage referral codes
CREATE POLICY "Admins can view all referral codes"
ON public.referral_codes FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can insert referral codes"
ON public.referral_codes FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update referral codes"
ON public.referral_codes FOR UPDATE
USING (is_admin(auth.uid()));

-- Anyone can validate a referral code (for signup)
CREATE POLICY "Anyone can validate active referral codes"
ON public.referral_codes FOR SELECT
USING (is_active = true);

-- Add referral tracking to user_roles table
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS referred_by_code text;

-- Create a function to count signups per referral code
CREATE OR REPLACE FUNCTION public.get_referral_stats()
RETURNS TABLE (
  code text,
  marketer_name text,
  signup_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    rc.code,
    rc.marketer_name,
    COUNT(ur.id) as signup_count
  FROM public.referral_codes rc
  LEFT JOIN public.user_roles ur ON ur.referred_by_code = rc.code
  GROUP BY rc.code, rc.marketer_name
  ORDER BY signup_count DESC;
$$;
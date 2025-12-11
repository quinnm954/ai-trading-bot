-- Create invite codes table
CREATE TABLE public.invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '30 days')
);

-- Enable RLS
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Admins can create invite codes
CREATE POLICY "Admins can create invite codes"
ON public.invite_codes FOR INSERT
WITH CHECK (public.is_admin(auth.uid()));

-- Admins can view all invite codes
CREATE POLICY "Admins can view all invite codes"
ON public.invite_codes FOR SELECT
USING (public.is_admin(auth.uid()));

-- Anyone can use an invite code (for signup validation)
CREATE POLICY "Anyone can validate invite codes"
ON public.invite_codes FOR SELECT
USING (used_by IS NULL AND expires_at > now());

-- Service role can update invite codes (when user signs up)
CREATE POLICY "Service can update invite codes"
ON public.invite_codes FOR UPDATE
USING (true);

-- Track invited users - add column to profiles or create tracking
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id);
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS has_free_access boolean DEFAULT false;
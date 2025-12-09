-- Fix user_roles table - only admins can manage roles
-- Prevent privilege escalation by restricting INSERT, UPDATE, DELETE to admins only

-- Allow admins to insert new roles
CREATE POLICY "Only admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- Allow admins to update roles
CREATE POLICY "Only admins can update roles"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Allow admins to delete roles
CREATE POLICY "Only admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

-- Make audit tables append-only (no UPDATE/DELETE for regular users)
-- ai_decisions - append only
CREATE POLICY "AI decisions are immutable"
ON public.ai_decisions
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "AI decisions cannot be deleted"
ON public.ai_decisions
FOR DELETE
TO authenticated
USING (false);

-- equity_history - append only
CREATE POLICY "Equity history is immutable"
ON public.equity_history
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Equity history cannot be deleted"
ON public.equity_history
FOR DELETE
TO authenticated
USING (false);

-- trades - make immutable after creation
CREATE POLICY "Trades cannot be deleted by users"
ON public.trades
FOR DELETE
TO authenticated
USING (false);

-- Prevent deletion of critical account data
CREATE POLICY "Paper accounts cannot be deleted"
ON public.paper_account
FOR DELETE
TO authenticated
USING (false);

CREATE POLICY "Live accounts cannot be deleted"
ON public.live_account
FOR DELETE
TO authenticated
USING (false);

CREATE POLICY "AI settings cannot be deleted"
ON public.ai_settings
FOR DELETE
TO authenticated
USING (false);

CREATE POLICY "Strategy performance cannot be deleted"
ON public.strategy_performance
FOR DELETE
TO authenticated
USING (false);
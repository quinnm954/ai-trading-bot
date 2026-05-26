-- Lock down public write access on signal/reference tables; service role bypasses RLS.

-- defi_yields
DROP POLICY IF EXISTS "Service role can manage DeFi yields" ON public.defi_yields;

-- mev_opportunities
DROP POLICY IF EXISTS "Service role can insert MEV opportunities" ON public.mev_opportunities;

-- moonshot_signals
DROP POLICY IF EXISTS "Service role can insert moonshot signals" ON public.moonshot_signals;
DROP POLICY IF EXISTS "Service role can update moonshot signals" ON public.moonshot_signals;

-- sentiment_signals
DROP POLICY IF EXISTS "Service role can insert sentiment signals" ON public.sentiment_signals;
DROP POLICY IF EXISTS "Service role can update sentiment signals" ON public.sentiment_signals;

-- whale_signals
DROP POLICY IF EXISTS "Service role can insert whale signals" ON public.whale_signals;
DROP POLICY IF EXISTS "Service role can update whale signals" ON public.whale_signals;

-- top_traders
DROP POLICY IF EXISTS "Service role can manage top traders" ON public.top_traders;

-- subscriptions: remove client write access (only service role / RPCs write)
DROP POLICY IF EXISTS "Service role can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Service role can update subscriptions" ON public.subscriptions;

-- invite_codes: tighten UPDATE - allow only redeeming an unused, unexpired code as oneself
DROP POLICY IF EXISTS "Service can update invite codes" ON public.invite_codes;
CREATE POLICY "Users can redeem own invite code"
ON public.invite_codes
FOR UPDATE
TO authenticated
USING (used_by IS NULL AND expires_at > now())
WITH CHECK (used_by = auth.uid());

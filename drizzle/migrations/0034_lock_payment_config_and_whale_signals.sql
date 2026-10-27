DROP POLICY IF EXISTS "Authenticated users can read payment config" ON public.crypto_payment_config;
CREATE POLICY "Admins can read payment config" ON public.crypto_payment_config
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Anyone can view whale signals" ON public.whale_signals;
REVOKE SELECT ON public.whale_signals FROM anon;
CREATE POLICY "Signed-in users can view whale signals" ON public.whale_signals
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
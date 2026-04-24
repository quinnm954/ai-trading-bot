-- Payment claims table for manual Cash App payments
CREATE TABLE public.payment_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('pro', 'unlimited')),
  amount NUMERIC NOT NULL,
  sender_cashtag TEXT NOT NULL,
  transaction_note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_claims_user ON public.payment_claims(user_id);
CREATE INDEX idx_payment_claims_status ON public.payment_claims(status);

ALTER TABLE public.payment_claims ENABLE ROW LEVEL SECURITY;

-- Users can submit their own claims
CREATE POLICY "Users can insert own payment claims"
  ON public.payment_claims FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own claims
CREATE POLICY "Users can view own payment claims"
  ON public.payment_claims FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all payment claims"
  ON public.payment_claims FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Admins can update (approve/reject)
CREATE POLICY "Admins can update payment claims"
  ON public.payment_claims FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- No deletes
CREATE POLICY "Payment claims cannot be deleted"
  ON public.payment_claims FOR DELETE
  USING (false);

-- Update timestamp trigger
CREATE TRIGGER update_payment_claims_updated_at
  BEFORE UPDATE ON public.payment_claims
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Approve claim: grants 30-day subscription
CREATE OR REPLACE FUNCTION public.approve_payment_claim(
  p_claim_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim RECORD;
  v_existing_end TIMESTAMP WITH TIME ZONE;
  v_new_start TIMESTAMP WITH TIME ZONE;
  v_new_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Only admins
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can approve payment claims';
  END IF;

  SELECT * INTO v_claim FROM public.payment_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;
  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'Claim is not pending (current status: %)', v_claim.status;
  END IF;

  -- Check existing active subscription end date for extension
  SELECT current_period_end INTO v_existing_end
  FROM public.subscriptions
  WHERE user_id = v_claim.user_id
    AND status = 'active'
    AND current_period_end > now()
  ORDER BY current_period_end DESC
  LIMIT 1;

  v_new_start := now();
  IF v_existing_end IS NOT NULL THEN
    v_new_end := v_existing_end + INTERVAL '30 days';
  ELSE
    v_new_end := now() + INTERVAL '30 days';
  END IF;

  -- Upsert subscription
  INSERT INTO public.subscriptions (
    user_id, tier, status, current_period_start, current_period_end, updated_at
  ) VALUES (
    v_claim.user_id, v_claim.tier, 'active', v_new_start, v_new_end, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = EXCLUDED.tier,
    status = 'active',
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();

  -- Mark claim approved
  UPDATE public.payment_claims
  SET status = 'approved',
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'success', true,
    'tier', v_claim.tier,
    'period_end', v_new_end
  );
END;
$$;

-- Reject claim
CREATE OR REPLACE FUNCTION public.reject_payment_claim(
  p_claim_id UUID,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins can reject payment claims';
  END IF;

  UPDATE public.payment_claims
  SET status = 'rejected',
      admin_notes = COALESCE(p_admin_notes, admin_notes),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_claim_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found or not pending';
  END IF;
END;
$$;

-- subscriptions table needs unique constraint on user_id for upsert above
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_key'
  ) THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
END $$;
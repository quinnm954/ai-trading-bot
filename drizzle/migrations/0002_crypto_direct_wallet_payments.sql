-- ============================================================
-- Direct-to-wallet crypto payments (USDC on Base), no processor
-- ============================================================

-- Global receiving config. Single row, owned by the creator/admin.
CREATE TABLE public.crypto_payment_config (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  wallet_address TEXT,
  chain TEXT NOT NULL DEFAULT 'base',
  token TEXT NOT NULL DEFAULT 'USDC',
  price_usd NUMERIC NOT NULL DEFAULT 29,
  enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crypto_payment_config_singleton CHECK (id = true)
);

GRANT SELECT ON public.crypto_payment_config TO authenticated;
GRANT INSERT, UPDATE ON public.crypto_payment_config TO authenticated;
GRANT ALL ON public.crypto_payment_config TO service_role;

ALTER TABLE public.crypto_payment_config ENABLE ROW LEVEL SECURITY;

-- Anyone signed in needs the address to pay; only admins can change it.
CREATE POLICY "Authenticated users can read payment config"
  ON public.crypto_payment_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert payment config"
  ON public.crypto_payment_config FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update payment config"
  ON public.crypto_payment_config FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.crypto_payment_config (id) VALUES (true);

-- ------------------------------------------------------------
-- Invoices. Each is identified on-chain by an exact unique amount.
-- ------------------------------------------------------------
CREATE TABLE public.crypto_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- exact amount the buyer must send, base price + unique micro-offset
  amount_usdc NUMERIC(20, 6) NOT NULL,
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'base',
  token TEXT NOT NULL DEFAULT 'USDC',
  status TEXT NOT NULL DEFAULT 'pending',
  tx_hash TEXT,
  from_address TEXT,
  block_number BIGINT,
  confirmed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '60 minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crypto_invoices_status_check
    CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled'))
);

-- One pending invoice per exact amount, so on-chain matching is unambiguous
CREATE UNIQUE INDEX crypto_invoices_pending_amount_uniq
  ON public.crypto_invoices (amount_usdc)
  WHERE status = 'pending';

CREATE INDEX crypto_invoices_user_idx ON public.crypto_invoices (user_id, created_at DESC);
CREATE INDEX crypto_invoices_pending_idx ON public.crypto_invoices (status, expires_at);
CREATE UNIQUE INDEX crypto_invoices_tx_hash_uniq ON public.crypto_invoices (tx_hash) WHERE tx_hash IS NOT NULL;

GRANT SELECT ON public.crypto_invoices TO authenticated;
GRANT ALL ON public.crypto_invoices TO service_role;

ALTER TABLE public.crypto_invoices ENABLE ROW LEVEL SECURITY;

-- Users read only their own invoices. Writes happen server-side only.
CREATE POLICY "Users can view their own invoices"
  ON public.crypto_invoices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all invoices"
  ON public.crypto_invoices FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- ------------------------------------------------------------
-- Tracks the last scanned block so the poller doesn't re-scan history
-- ------------------------------------------------------------
CREATE TABLE public.crypto_scan_state (
  chain TEXT PRIMARY KEY,
  last_scanned_block BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.crypto_scan_state TO authenticated;
GRANT ALL ON public.crypto_scan_state TO service_role;

ALTER TABLE public.crypto_scan_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view scan state"
  ON public.crypto_scan_state FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

INSERT INTO public.crypto_scan_state (chain, last_scanned_block) VALUES ('base', 0);

-- ------------------------------------------------------------
-- Credit a confirmed invoice: extend access by 30 days
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_crypto_invoice(
  p_invoice_id UUID,
  p_tx_hash TEXT,
  p_from_address TEXT,
  p_block_number BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD;
  v_existing_end TIMESTAMPTZ;
  v_new_end TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_invoice FROM public.crypto_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;
  IF v_invoice.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', true, 'already_confirmed', true);
  END IF;

  -- Extend from the current period end when still active, else from now
  SELECT current_period_end INTO v_existing_end
  FROM public.subscriptions
  WHERE user_id = v_invoice.user_id
    AND status = 'active'
    AND current_period_end > now();

  v_new_end := COALESCE(v_existing_end, now()) + INTERVAL '30 days';

  INSERT INTO public.subscriptions (
    user_id, tier, status, current_period_start, current_period_end, cancel_at_period_end, updated_at
  ) VALUES (
    v_invoice.user_id, 'pro', 'active', now(), v_new_end, false, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = 'pro',
    status = 'active',
    current_period_start = COALESCE(public.subscriptions.current_period_start, now()),
    current_period_end = v_new_end,
    cancel_at_period_end = false,
    updated_at = now();

  UPDATE public.crypto_invoices
  SET status = 'confirmed',
      tx_hash = p_tx_hash,
      from_address = p_from_address,
      block_number = p_block_number,
      confirmed_at = now()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'period_end', v_new_end);
END;
$function$;

-- ------------------------------------------------------------
-- Expire stale pending invoices so their amounts can be reused
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_crypto_invoices()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.crypto_invoices
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- Keep subscriptions.updated_at fresh
CREATE TRIGGER trg_crypto_payment_config_updated_at
  BEFORE UPDATE ON public.crypto_payment_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Fix 1: payment_claims INSERT must force status='pending'
DROP POLICY IF EXISTS "Users can insert own payment claims" ON public.payment_claims;
CREATE POLICY "Users can insert own payment claims"
ON public.payment_claims
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND admin_notes IS NULL);

-- Fix 2: leverage_settings - prevent users from forging admin approval columns
CREATE OR REPLACE FUNCTION public.protect_leverage_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    NEW.live_confirmed_by_admin := OLD.live_confirmed_by_admin;
    NEW.live_confirmed_at := OLD.live_confirmed_at;
    NEW.live_max_leverage := OLD.live_max_leverage;
    NEW.live_enabled := OLD.live_enabled;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_leverage_admin_columns_trg ON public.leverage_settings;
CREATE TRIGGER protect_leverage_admin_columns_trg
BEFORE UPDATE ON public.leverage_settings
FOR EACH ROW
EXECUTE FUNCTION public.protect_leverage_admin_columns();

-- Also protect on INSERT: non-admins cannot create rows with these fields pre-set
CREATE OR REPLACE FUNCTION public.protect_leverage_admin_columns_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    NEW.live_confirmed_by_admin := NULL;
    NEW.live_confirmed_at := NULL;
    NEW.live_enabled := false;
    NEW.live_max_leverage := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_leverage_admin_columns_insert_trg ON public.leverage_settings;
CREATE TRIGGER protect_leverage_admin_columns_insert_trg
BEFORE INSERT ON public.leverage_settings
FOR EACH ROW
EXECUTE FUNCTION public.protect_leverage_admin_columns_insert();

-- Fix 3: invite_codes redemption - restrict columns via trigger
CREATE OR REPLACE FUNCTION public.protect_invite_code_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    -- Only allow used_by and used_at to change during redemption
    NEW.code := OLD.code;
    NEW.created_by := OLD.created_by;
    NEW.expires_at := OLD.expires_at;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_invite_code_columns_trg ON public.invite_codes;
CREATE TRIGGER protect_invite_code_columns_trg
BEFORE UPDATE ON public.invite_codes
FOR EACH ROW
EXECUTE FUNCTION public.protect_invite_code_columns();

-- Fix 4: subscriptions - explicit deny INSERT/UPDATE/DELETE for non-service-role
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users cannot insert subscriptions" ON public.subscriptions;
CREATE POLICY "Users cannot insert subscriptions"
ON public.subscriptions
FOR INSERT
TO authenticated
WITH CHECK (false);

DROP POLICY IF EXISTS "Users cannot update subscriptions" ON public.subscriptions;
CREATE POLICY "Users cannot update subscriptions"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (false);

DROP POLICY IF EXISTS "Users cannot delete subscriptions" ON public.subscriptions;
CREATE POLICY "Users cannot delete subscriptions"
ON public.subscriptions
FOR DELETE
TO authenticated
USING (false);

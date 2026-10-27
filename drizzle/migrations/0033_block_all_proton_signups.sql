CREATE OR REPLACE FUNCTION public.block_probe_signups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) ~ '(keyhunt|probe)' OR lower(NEW.email) ~ '@(proton\.me|protonmail\.com|pm\.me)$' THEN
    RAISE EXCEPTION 'Sign-ups from this email address are not allowed';
  END IF;
  RETURN NEW;
END $$;
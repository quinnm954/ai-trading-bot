CREATE OR REPLACE FUNCTION public.block_probe_signups()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) ~ '(keyhunt|probe)' THEN
    RAISE EXCEPTION 'Sign-ups from this email address are not allowed';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS block_probe_signups ON auth.users;
CREATE TRIGGER block_probe_signups BEFORE INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.block_probe_signups();
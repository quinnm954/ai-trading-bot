CREATE TABLE public.commander_specialists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  title text NOT NULL,
  mission text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  last_report text,
  last_report_at timestamptz,
  hired_reason text,
  fired_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  fired_at timestamptz
);
CREATE UNIQUE INDEX commander_specialists_active_name_idx ON public.commander_specialists (user_id, lower(name)) WHERE active;
GRANT SELECT ON public.commander_specialists TO authenticated;
GRANT ALL ON public.commander_specialists TO service_role;
ALTER TABLE public.commander_specialists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their specialists" ON public.commander_specialists FOR SELECT TO authenticated USING (auth.uid() = user_id);
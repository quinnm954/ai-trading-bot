ALTER TABLE public.ai_settings
  ADD COLUMN IF NOT EXISTS commander_skip_tape_gate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commander_skip_probation boolean NOT NULL DEFAULT false;

CREATE TABLE public.commander_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'lesson',
  content text NOT NULL,
  rule_type text,
  rule_params jsonb,
  symbol text,
  active boolean NOT NULL DEFAULT true,
  retired_reason text,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.commander_memory TO authenticated;
GRANT ALL ON public.commander_memory TO service_role;
ALTER TABLE public.commander_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their commander memory" ON public.commander_memory FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX commander_memory_user_idx ON public.commander_memory (user_id, kind, active, created_at DESC);
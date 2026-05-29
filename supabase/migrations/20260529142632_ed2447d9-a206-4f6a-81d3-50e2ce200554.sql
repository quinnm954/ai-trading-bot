
-- Agent state: one row per agent per user
CREATE TABLE public.agent_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent TEXT NOT NULL CHECK (agent IN ('trader','analyst','watcher','risk','healer')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','working','waiting','paused','error')),
  current_task TEXT,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_cycle_at TIMESTAMPTZ,
  cycle_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent)
);

GRANT SELECT, INSERT, UPDATE ON public.agent_state TO authenticated;
GRANT ALL ON public.agent_state TO service_role;

ALTER TABLE public.agent_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own agent state" ON public.agent_state FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own agent state" ON public.agent_state FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own agent state" ON public.agent_state FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Inter-agent message bus
CREATE TABLE public.agent_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  message_type TEXT NOT NULL,
  subject TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread','read','actioned','dismissed')),
  in_reply_to UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_messages_user_created ON public.agent_messages (user_id, created_at DESC);
CREATE INDEX idx_agent_messages_to_status ON public.agent_messages (user_id, to_agent, status);

GRANT SELECT, INSERT, UPDATE ON public.agent_messages TO authenticated;
GRANT ALL ON public.agent_messages TO service_role;

ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own agent messages" ON public.agent_messages FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own agent messages" ON public.agent_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own agent messages" ON public.agent_messages FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Manual overrides from the console
CREATE TABLE public.agent_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  agent TEXT NOT NULL,
  override_type TEXT NOT NULL CHECK (override_type IN ('pause','resume','veto_next','force_action','instruction')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  consumed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_overrides_active ON public.agent_overrides (user_id, agent, active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_overrides TO authenticated;
GRANT ALL ON public.agent_overrides TO service_role;

ALTER TABLE public.agent_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own agent overrides" ON public.agent_overrides FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own agent overrides" ON public.agent_overrides FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own agent overrides" ON public.agent_overrides FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own agent overrides" ON public.agent_overrides FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Incidents detected and resolved by the Healer agent
CREATE TABLE public.agent_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  detected_by TEXT NOT NULL DEFAULT 'healer',
  incident_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','error','critical')),
  description TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  remediation TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_incidents_user_created ON public.agent_incidents (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.agent_incidents TO authenticated;
GRANT ALL ON public.agent_incidents TO service_role;

ALTER TABLE public.agent_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own agent incidents" ON public.agent_incidents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own agent incidents" ON public.agent_incidents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own agent incidents" ON public.agent_incidents FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Enable realtime on agent tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_incidents;

-- updated_at triggers
CREATE TRIGGER trg_agent_state_updated_at BEFORE UPDATE ON public.agent_state FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

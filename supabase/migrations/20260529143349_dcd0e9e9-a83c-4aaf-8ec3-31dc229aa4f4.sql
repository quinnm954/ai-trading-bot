
CREATE TABLE public.healer_remedies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID, -- null = global default remedy, non-null = user-tuned
  remedy_key TEXT NOT NULL,
  description TEXT NOT NULL,
  match_type TEXT NOT NULL DEFAULT 'incident_type', -- 'incident_type' | 'message_substring' | 'condition'
  match_pattern TEXT NOT NULL,
  action TEXT NOT NULL, -- code-side action key
  action_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_applied_at TIMESTAMP WITH TIME ZONE,
  last_outcome TEXT, -- 'success' | 'failure' | 'pending'
  confidence NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, remedy_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.healer_remedies TO authenticated;
GRANT ALL ON public.healer_remedies TO service_role;

ALTER TABLE public.healer_remedies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own or global remedies"
  ON public.healer_remedies FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users manage own remedies"
  ON public.healer_remedies FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own remedies"
  ON public.healer_remedies FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users delete own remedies"
  ON public.healer_remedies FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_healer_remedies_updated_at
  BEFORE UPDATE ON public.healer_remedies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_healer_remedies_lookup ON public.healer_remedies(user_id, enabled, remedy_key);

ALTER PUBLICATION supabase_realtime ADD TABLE public.healer_remedies;

-- Seed global default remedies (user_id = NULL)
INSERT INTO public.healer_remedies (user_id, remedy_key, description, match_type, match_pattern, action, action_params, confidence) VALUES
  (NULL, 'ai_credits_exhausted', 'AI Gateway 402 / no credits — switch to rule-based fallback',
    'message_substring', 'payment_required',
    'disable_ai_autonomous_mode', '{"reenable_after_minutes": 60}'::jsonb, 80),
  (NULL, 'stuck_pending_trades', 'Pending trades older than 15 minutes — expire them',
    'condition', 'pending_trades_stale_15m',
    'expire_stale_pending_trades', '{"older_than_minutes": 15}'::jsonb, 95),
  (NULL, 'stuck_agent_working', 'Agent stuck in working state > 5 minutes — reset to idle',
    'condition', 'agent_state_stuck_5m',
    'reset_stuck_agents', '{"older_than_minutes": 5}'::jsonb, 90),
  (NULL, 'repeated_trader_errors', '3+ trader errors within 10 minutes — pause trader and alert',
    'condition', 'trader_errors_3_in_10m',
    'pause_trader_temporarily', '{"pause_minutes": 15}'::jsonb, 70),
  (NULL, 'broker_sync_failure', 'Broker balance sync failed repeatedly — log and alert',
    'message_substring', 'sync-broker-balances',
    'alert_broker_sync', '{}'::jsonb, 50),
  (NULL, 'volatile_standstill', 'No trades for 6+ cycles in volatile regime — log advisory only',
    'condition', 'no_trades_6_cycles_volatile',
    'advise_loosen_filters', '{}'::jsonb, 40),
  (NULL, 'kill_switch_auto_recovery', 'Kill switch active but daily loss recovered below 50% of limit — propose unlock',
    'condition', 'kill_switch_loss_recovered',
    'propose_kill_switch_release', '{}'::jsonb, 60);

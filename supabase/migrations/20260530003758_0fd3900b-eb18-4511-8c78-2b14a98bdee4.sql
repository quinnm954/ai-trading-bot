
-- Remove trade audit table (functionality merged into Analyst agent)
DROP TABLE IF EXISTS public.trade_audit_reports CASCADE;

-- Enable cron + http extensions for scheduled agent cycles
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Seed remedies for the new supervisor agent
INSERT INTO public.healer_remedies (user_id, remedy_key, description, match_type, match_pattern, action, action_params, enabled, confidence)
VALUES
  (NULL, 'supervisor_stale_agent', 'An agent has not heartbeated in >15m while bot is enabled', 'incident_type', 'supervisor_stale_agent', 'reset_stuck_agents', '{}'::jsonb, true, 60),
  (NULL, 'supervisor_trader_silent', 'Trader has not run in 30+ minutes despite enabled bot', 'incident_type', 'supervisor_trader_silent', 'advise_loosen_filters', '{}'::jsonb, true, 50),
  (NULL, 'supervisor_cycle_incomplete', 'Last cycle did not complete all phases', 'incident_type', 'supervisor_cycle_incomplete', 'reset_stuck_agents', '{}'::jsonb, true, 55)
ON CONFLICT DO NOTHING;

-- Remove supervisor agent rows and overrides
DELETE FROM public.agent_state WHERE agent = 'supervisor';
DELETE FROM public.agent_overrides WHERE agent = 'supervisor';

-- Seed/update healer remedies for the expanded healer (absorbs supervisor + code-aware checks)
INSERT INTO public.healer_remedies (user_id, remedy_key, description, match_type, match_pattern, action, action_params, enabled, confidence)
VALUES
  (NULL, 'reconcile_orphan_trades', 'Trades stuck "open" >7d without a position', 'incident_type', 'orphan_open_trades', 'reconcile_orphan_trades', '{}'::jsonb, true, 70),
  (NULL, 'kill_switch_stuck', 'Kill switch active but daily loss has recovered', 'incident_type', 'kill_switch_stuck', 'release_kill_switch', '{}'::jsonb, true, 65),
  (NULL, 'schema_drift_detected', 'Code references missing column/table', 'incident_type', 'schema_drift_detected', 'alert_schema_drift', '{}'::jsonb, true, 90),
  (NULL, 'rls_or_permission_error', 'RLS / permission denial detected in trader errors', 'incident_type', 'rls_or_permission_error', 'alert_rls_error', '{}'::jsonb, true, 90),
  (NULL, 'missing_agent_rows', 'Required agent state rows missing', 'incident_type', 'missing_agent_rows', 'bootstrap_missing_agents', '{}'::jsonb, true, 80),
  (NULL, 'broker_sync_stale', 'Live account hasn''t synced in over an hour', 'incident_type', 'broker_sync_stale', 'alert_broker_sync', '{}'::jsonb, true, 75)
ON CONFLICT DO NOTHING;
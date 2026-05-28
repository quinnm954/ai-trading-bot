
CREATE TABLE public.trade_audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  total_trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  total_pnl numeric NOT NULL DEFAULT 0,
  win_rate numeric NOT NULL DEFAULT 0,
  worst_loss numeric NOT NULL DEFAULT 0,
  failure_themes jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  applied_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trade_audit_reports TO authenticated;
GRANT ALL ON public.trade_audit_reports TO service_role;

ALTER TABLE public.trade_audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit reports"
  ON public.trade_audit_reports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_trade_audit_reports_user_created
  ON public.trade_audit_reports (user_id, created_at DESC);

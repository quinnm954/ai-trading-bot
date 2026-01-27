-- Create table to track trial reminder emails sent
CREATE TABLE public.trial_reminder_emails_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reminder_type TEXT NOT NULL, -- '3_day' or '1_day'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, reminder_type)
);

-- Enable RLS
ALTER TABLE public.trial_reminder_emails_sent ENABLE ROW LEVEL SECURITY;

-- Only service role can manage this table (used by edge function)
CREATE POLICY "Service role only" ON public.trial_reminder_emails_sent
  FOR ALL USING (false);
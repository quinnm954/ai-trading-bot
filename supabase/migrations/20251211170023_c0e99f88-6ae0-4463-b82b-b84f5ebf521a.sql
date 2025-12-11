-- Add risk management fields to ai_settings
ALTER TABLE public.ai_settings 
ADD COLUMN IF NOT EXISTS weekly_loss_limit numeric DEFAULT 10,
ADD COLUMN IF NOT EXISTS max_drawdown numeric DEFAULT 20,
ADD COLUMN IF NOT EXISTS kill_switch_active boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS kill_switch_triggered_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS live_mode_confirmed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS daily_loss_today numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS weekly_loss_current numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_loss_reset_date date DEFAULT CURRENT_DATE,
ADD COLUMN IF NOT EXISTS peak_equity numeric DEFAULT 100000,
ADD COLUMN IF NOT EXISTS current_drawdown numeric DEFAULT 0;

-- Create risk_events table to track all risk-related events
CREATE TABLE IF NOT EXISTS public.risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'trade_blocked', 'kill_switch_triggered', 'daily_limit_hit', 'weekly_limit_hit', 'max_drawdown_hit'
  severity text NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  message text NOT NULL,
  details jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on risk_events
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for risk_events
CREATE POLICY "Users can view own risk events" ON public.risk_events
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own risk events" ON public.risk_events
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Risk events cannot be deleted" ON public.risk_events
FOR DELETE USING (false);

CREATE POLICY "Risk events cannot be updated" ON public.risk_events
FOR UPDATE USING (false);

-- Create daily_pnl table to track daily performance
CREATE TABLE IF NOT EXISTS public.daily_pnl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  realized_pnl numeric DEFAULT 0,
  unrealized_pnl numeric DEFAULT 0,
  trades_count integer DEFAULT 0,
  wins integer DEFAULT 0,
  losses integer DEFAULT 0,
  peak_equity numeric,
  ending_equity numeric,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(user_id, date)
);

-- Enable RLS on daily_pnl
ALTER TABLE public.daily_pnl ENABLE ROW LEVEL SECURITY;

-- RLS policies for daily_pnl
CREATE POLICY "Users can view own daily pnl" ON public.daily_pnl
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own daily pnl" ON public.daily_pnl
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own daily pnl" ON public.daily_pnl
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Daily pnl cannot be deleted" ON public.daily_pnl
FOR DELETE USING (false);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_risk_events_user_date ON public.risk_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_pnl_user_date ON public.daily_pnl(user_id, date DESC);
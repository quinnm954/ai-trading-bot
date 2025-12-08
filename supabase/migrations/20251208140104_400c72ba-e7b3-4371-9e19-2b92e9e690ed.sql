-- Create enum types for trading
CREATE TYPE public.trade_status AS ENUM ('open', 'closed', 'cancelled');
CREATE TYPE public.trade_side AS ENUM ('buy', 'sell');
CREATE TYPE public.market_type AS ENUM ('stocks', 'crypto');
CREATE TYPE public.bot_status AS ENUM ('idle', 'learning', 'trading');
CREATE TYPE public.market_regime AS ENUM ('trending', 'ranging', 'high_volatility', 'low_volatility', 'news_driven');
CREATE TYPE public.strategy_type AS ENUM ('rsi', 'ema_crossover', 'macd', 'trend_breakout', 'volatility_breakout', 'grid', 'dca', 'custom');

-- Paper trading account
CREATE TABLE public.paper_account (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  balance DECIMAL(18, 8) NOT NULL DEFAULT 100000,
  initial_balance DECIMAL(18, 8) NOT NULL DEFAULT 100000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Trades table
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side trade_side NOT NULL,
  quantity DECIMAL(18, 8) NOT NULL,
  entry_price DECIMAL(18, 8) NOT NULL,
  exit_price DECIMAL(18, 8),
  status trade_status NOT NULL DEFAULT 'open',
  market_type market_type NOT NULL,
  strategy strategy_type,
  pnl DECIMAL(18, 8),
  ai_reasoning TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE
);

-- Positions table
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side trade_side NOT NULL,
  quantity DECIMAL(18, 8) NOT NULL,
  avg_entry_price DECIMAL(18, 8) NOT NULL,
  current_price DECIMAL(18, 8),
  market_type market_type NOT NULL,
  strategy strategy_type,
  unrealized_pnl DECIMAL(18, 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Equity history for charting
CREATE TABLE public.equity_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  equity DECIMAL(18, 8) NOT NULL,
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- AI trading settings
CREATE TABLE public.ai_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT false,
  max_capital_usage DECIMAL(5, 2) DEFAULT 80,
  max_position_size DECIMAL(5, 2) DEFAULT 10,
  max_daily_loss DECIMAL(5, 2) DEFAULT 5,
  max_concurrent_trades INTEGER DEFAULT 5,
  allowed_markets TEXT[] DEFAULT ARRAY['stocks', 'crypto'],
  bot_status bot_status DEFAULT 'idle',
  current_regime market_regime DEFAULT 'ranging',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- API keys (encrypted secrets stored securely)
CREATE TABLE public.api_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  api_key_hint TEXT, -- Only last 4 chars for display
  is_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, provider)
);

-- Strategy performance tracking
CREATE TABLE public.strategy_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  strategy strategy_type NOT NULL,
  market_regime market_regime NOT NULL,
  win_rate DECIMAL(5, 2) DEFAULT 0,
  avg_profit DECIMAL(18, 8) DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  score DECIMAL(5, 2) DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, strategy, market_regime)
);

-- AI decision logs
CREATE TABLE public.ai_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL,
  reasoning TEXT NOT NULL,
  strategy strategy_type,
  symbol TEXT,
  action TEXT,
  market_regime market_regime,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.paper_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_decisions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for paper_account
CREATE POLICY "Users can view own paper account" ON public.paper_account FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own paper account" ON public.paper_account FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own paper account" ON public.paper_account FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for trades
CREATE POLICY "Users can view own trades" ON public.trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON public.trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON public.trades FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for positions
CREATE POLICY "Users can view own positions" ON public.positions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own positions" ON public.positions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own positions" ON public.positions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own positions" ON public.positions FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for equity_history
CREATE POLICY "Users can view own equity history" ON public.equity_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own equity history" ON public.equity_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for ai_settings
CREATE POLICY "Users can view own ai settings" ON public.ai_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai settings" ON public.ai_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own ai settings" ON public.ai_settings FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for api_connections
CREATE POLICY "Users can view own api connections" ON public.api_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own api connections" ON public.api_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own api connections" ON public.api_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own api connections" ON public.api_connections FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for strategy_performance
CREATE POLICY "Users can view own strategy performance" ON public.strategy_performance FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own strategy performance" ON public.strategy_performance FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own strategy performance" ON public.strategy_performance FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for ai_decisions
CREATE POLICY "Users can view own ai decisions" ON public.ai_decisions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own ai decisions" ON public.ai_decisions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_paper_account_updated_at BEFORE UPDATE ON public.paper_account FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON public.positions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ai_settings_updated_at BEFORE UPDATE ON public.ai_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_api_connections_updated_at BEFORE UPDATE ON public.api_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
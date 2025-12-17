-- Create table for whale tracking signals
CREATE TABLE public.whale_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  whale_address TEXT,
  action TEXT NOT NULL, -- 'accumulation', 'distribution', 'transfer'
  amount NUMERIC NOT NULL,
  amount_usd NUMERIC,
  transaction_hash TEXT,
  from_exchange BOOLEAN DEFAULT false,
  to_exchange BOOLEAN DEFAULT false,
  confidence NUMERIC DEFAULT 0,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for social sentiment signals
CREATE TABLE public.sentiment_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  source TEXT NOT NULL, -- 'twitter', 'reddit', 'telegram', 'discord'
  sentiment_score NUMERIC NOT NULL, -- -1 to 1
  mention_count INTEGER DEFAULT 0,
  bullish_count INTEGER DEFAULT 0,
  bearish_count INTEGER DEFAULT 0,
  trending_rank INTEGER,
  influencer_mentions INTEGER DEFAULT 0,
  sample_posts JSONB,
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for MEV opportunities
CREATE TABLE public.mev_opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  opportunity_type TEXT NOT NULL, -- 'arbitrage', 'sandwich', 'liquidation', 'frontrun'
  estimated_profit_usd NUMERIC,
  gas_cost_usd NUMERIC,
  net_profit_usd NUMERIC,
  dex_pair TEXT,
  chain TEXT DEFAULT 'ethereum',
  risk_level TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  expires_at TIMESTAMP WITH TIME ZONE,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for top traders to copy
CREATE TABLE public.top_traders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  total_pnl_usd NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  avg_trade_size_usd NUMERIC,
  best_performing_assets TEXT[],
  trading_style TEXT, -- 'scalper', 'swing', 'holder', 'whale'
  risk_score NUMERIC DEFAULT 50, -- 0-100
  followers_count INTEGER DEFAULT 0,
  last_active_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for copy trade signals
CREATE TABLE public.copy_trade_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trader_id UUID REFERENCES public.top_traders(id),
  user_id UUID,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL, -- 'buy', 'sell'
  entry_price NUMERIC,
  quantity NUMERIC,
  trade_value_usd NUMERIC,
  copied_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'pending', -- 'pending', 'executed', 'skipped'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for DeFi yield opportunities
CREATE TABLE public.defi_yields (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  protocol TEXT NOT NULL, -- 'aave', 'compound', 'uniswap', 'curve', etc.
  chain TEXT NOT NULL DEFAULT 'ethereum',
  pool_name TEXT NOT NULL,
  asset_symbol TEXT NOT NULL,
  apy NUMERIC NOT NULL,
  tvl_usd NUMERIC,
  risk_level TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  impermanent_loss_risk BOOLEAN DEFAULT false,
  min_deposit_usd NUMERIC DEFAULT 0,
  rewards_token TEXT,
  rewards_apy NUMERIC DEFAULT 0,
  total_apy NUMERIC GENERATED ALWAYS AS (apy + rewards_apy) STORED,
  audited BOOLEAN DEFAULT false,
  url TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user preferences for copy trading
CREATE TABLE public.copy_trading_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  enabled BOOLEAN DEFAULT false,
  max_copy_amount_usd NUMERIC DEFAULT 100,
  min_trader_win_rate NUMERIC DEFAULT 60,
  min_trader_trades INTEGER DEFAULT 50,
  auto_copy BOOLEAN DEFAULT false,
  copy_percentage NUMERIC DEFAULT 10, -- percentage of trader's position size
  max_concurrent_copies INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS on all new tables
ALTER TABLE public.whale_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentiment_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mev_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.top_traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_trade_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.defi_yields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_trading_settings ENABLE ROW LEVEL SECURITY;

-- Public read access for market signals
CREATE POLICY "Anyone can view whale signals" ON public.whale_signals FOR SELECT USING (true);
CREATE POLICY "Service role can insert whale signals" ON public.whale_signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update whale signals" ON public.whale_signals FOR UPDATE USING (true);

CREATE POLICY "Anyone can view sentiment signals" ON public.sentiment_signals FOR SELECT USING (true);
CREATE POLICY "Service role can insert sentiment signals" ON public.sentiment_signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update sentiment signals" ON public.sentiment_signals FOR UPDATE USING (true);

CREATE POLICY "Anyone can view MEV opportunities" ON public.mev_opportunities FOR SELECT USING (true);
CREATE POLICY "Service role can insert MEV opportunities" ON public.mev_opportunities FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view top traders" ON public.top_traders FOR SELECT USING (true);
CREATE POLICY "Service role can manage top traders" ON public.top_traders FOR ALL USING (true);

CREATE POLICY "Anyone can view DeFi yields" ON public.defi_yields FOR SELECT USING (true);
CREATE POLICY "Service role can manage DeFi yields" ON public.defi_yields FOR ALL USING (true);

-- User-specific RLS for copy trading
CREATE POLICY "Users can view own copy trade signals" ON public.copy_trade_signals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own copy trade signals" ON public.copy_trade_signals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own copy trade signals" ON public.copy_trade_signals FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own copy trading settings" ON public.copy_trading_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own copy trading settings" ON public.copy_trading_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own copy trading settings" ON public.copy_trading_settings FOR UPDATE USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX idx_whale_signals_symbol ON public.whale_signals(symbol);
CREATE INDEX idx_whale_signals_detected_at ON public.whale_signals(detected_at DESC);
CREATE INDEX idx_sentiment_signals_symbol ON public.sentiment_signals(symbol);
CREATE INDEX idx_sentiment_signals_analyzed_at ON public.sentiment_signals(analyzed_at DESC);
CREATE INDEX idx_mev_opportunities_symbol ON public.mev_opportunities(symbol);
CREATE INDEX idx_defi_yields_apy ON public.defi_yields(total_apy DESC);
CREATE INDEX idx_top_traders_win_rate ON public.top_traders(win_rate DESC);
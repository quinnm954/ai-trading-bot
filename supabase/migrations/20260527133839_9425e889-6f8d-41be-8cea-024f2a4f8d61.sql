
-- Polymarket event scores (AI conviction per event)
CREATE TABLE public.polymarket_event_scores (
  market_id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  question TEXT NOT NULL,
  symbols TEXT[] NOT NULL DEFAULT '{}',
  conviction INTEGER NOT NULL CHECK (conviction BETWEEN 0 AND 100),
  direction TEXT NOT NULL CHECK (direction IN ('bullish','bearish','neutral')),
  rationale TEXT,
  yes_probability NUMERIC,
  volume NUMERIC,
  end_date TIMESTAMPTZ,
  url TEXT,
  scored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.polymarket_event_scores TO anon, authenticated;
GRANT ALL ON public.polymarket_event_scores TO service_role;
ALTER TABLE public.polymarket_event_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read polymarket scores" ON public.polymarket_event_scores FOR SELECT USING (true);

-- Crypto news feed
CREATE TABLE public.news_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  summary TEXT,
  symbols TEXT[] NOT NULL DEFAULT '{}',
  sentiment NUMERIC NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_news_feed_published ON public.news_feed (published_at DESC);
CREATE INDEX idx_news_feed_symbols ON public.news_feed USING GIN (symbols);
GRANT SELECT ON public.news_feed TO anon, authenticated;
GRANT ALL ON public.news_feed TO service_role;
ALTER TABLE public.news_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read news" ON public.news_feed FOR SELECT USING (true);

-- Titan AI fusion signals (one row per symbol per cycle)
CREATE TABLE public.titan_fusion_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  conviction INTEGER NOT NULL CHECK (conviction BETWEEN 0 AND 100),
  direction TEXT NOT NULL CHECK (direction IN ('bullish','bearish','neutral')),
  horizon TEXT NOT NULL DEFAULT 'short',
  drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
  rationale TEXT,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fusion_symbol_time ON public.titan_fusion_signals (symbol, generated_at DESC);
CREATE INDEX idx_fusion_time ON public.titan_fusion_signals (generated_at DESC);
GRANT SELECT ON public.titan_fusion_signals TO anon, authenticated;
GRANT ALL ON public.titan_fusion_signals TO service_role;
ALTER TABLE public.titan_fusion_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read fusion" ON public.titan_fusion_signals FOR SELECT USING (true);

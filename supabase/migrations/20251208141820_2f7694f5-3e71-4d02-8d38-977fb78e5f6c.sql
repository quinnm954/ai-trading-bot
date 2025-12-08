-- Enable replica identity for realtime updates
ALTER TABLE public.strategy_performance REPLICA IDENTITY FULL;

-- Add table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.strategy_performance;
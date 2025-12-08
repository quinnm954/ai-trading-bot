-- Enable realtime for trades table
ALTER TABLE public.trades REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;

-- Enable realtime for positions table
ALTER TABLE public.positions REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;

-- Enable realtime for paper_account table
ALTER TABLE public.paper_account REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.paper_account;

-- Enable realtime for live_account table
ALTER TABLE public.live_account REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_account;
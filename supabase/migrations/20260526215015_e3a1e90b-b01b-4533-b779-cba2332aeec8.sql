UPDATE public.positions SET strategy='scalp' WHERE strategy IS DISTINCT FROM 'scalp';
UPDATE public.trades SET strategy='scalp' WHERE status='open' AND strategy IS DISTINCT FROM 'scalp';
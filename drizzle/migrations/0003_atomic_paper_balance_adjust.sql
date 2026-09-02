-- Atomic paper cash adjustment. Prevents lost debits/credits when two engine
-- invocations read the same balance and write back absolute values.
CREATE OR REPLACE FUNCTION public.adjust_paper_balance(p_user_id uuid, p_delta numeric)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new numeric;
BEGIN
  UPDATE public.paper_account
  SET balance = GREATEST(0, balance + p_delta),
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new;

  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_paper_balance(uuid, numeric) TO authenticated, service_role;

-- Correct balances that drifted from initial deposit + realized P&L because of
-- the lost-update race (absolute balance writes from concurrent cycles).
WITH realized AS (
  SELECT pa.user_id,
         pa.initial_balance + COALESCE((
           SELECT SUM(t.pnl) FROM public.trades t
           WHERE t.user_id = pa.user_id AND t.is_paper AND t.status = 'closed'
         ), 0) AS expected
  FROM public.paper_account pa
)
UPDATE public.paper_account pa
SET balance = r.expected, updated_at = now()
FROM realized r
WHERE pa.user_id = r.user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.positions p
    WHERE p.user_id = pa.user_id AND p.is_paper
  )
  AND ABS(pa.balance - r.expected) > 0.01;
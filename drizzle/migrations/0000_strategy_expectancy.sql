-- Trailing, fee-inclusive expectancy per strategy and trading mode.
-- Only the last 20 closed trades per (user, strategy, mode) count, so a strategy
-- that stops working is benched quickly instead of averaging out over history.
CREATE OR REPLACE VIEW public.strategy_expectancy
WITH (security_invoker = true) AS
WITH ranked AS (
  SELECT
    t.user_id,
    COALESCE(t.strategy::text, 'unknown') AS strategy,
    t.is_paper,
    COALESCE(t.pnl, 0) AS pnl,
    NULLIF(t.entry_price * t.quantity, 0) AS notional,
    t.closed_at,
    ROW_NUMBER() OVER (
      PARTITION BY t.user_id, COALESCE(t.strategy::text, 'unknown'), t.is_paper
      ORDER BY t.closed_at DESC NULLS LAST
    ) AS rn
  FROM public.trades t
  WHERE t.status = 'closed' AND t.closed_at IS NOT NULL
)
SELECT
  user_id,
  strategy,
  is_paper,
  COUNT(*)::int                                                        AS sample_size,
  ROUND((SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)::numeric
         / GREATEST(COUNT(*), 1) * 100), 2)                            AS win_rate,
  ROUND(COALESCE(AVG(CASE WHEN pnl > 0 THEN pnl END), 0)::numeric, 4)  AS avg_win,
  ROUND(COALESCE(AVG(CASE WHEN pnl < 0 THEN pnl END), 0)::numeric, 4)  AS avg_loss,
  ROUND(SUM(pnl)::numeric, 4)                                          AS net_pnl,
  -- Expectancy in dollars per trade
  ROUND((SUM(pnl) / GREATEST(COUNT(*), 1))::numeric, 4)                AS expectancy_per_trade,
  -- Expectancy as % of notional risked per trade
  ROUND(COALESCE(AVG(pnl / notional) * 100, 0)::numeric, 4)            AS expectancy_pct,
  MAX(closed_at)                                                       AS last_trade_at
FROM ranked
WHERE rn <= 20
GROUP BY user_id, strategy, is_paper;

GRANT SELECT ON public.strategy_expectancy TO authenticated;
GRANT SELECT ON public.strategy_expectancy TO service_role;

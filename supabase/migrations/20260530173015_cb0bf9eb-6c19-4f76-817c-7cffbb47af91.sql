
-- Reconcile orphan "open" trades whose positions no longer exist.
-- They were sold via a path that didn't update the trade row, so they
-- appear forever as Active in the Trade Journal even though the
-- position is gone.

UPDATE public.trades t
SET
  status = 'cancelled',
  closed_at = COALESCE(t.closed_at, now()),
  exit_reason = COALESCE(t.exit_reason, 'reconciled_orphan_position_closed')
WHERE t.status = 'open'
  AND NOT EXISTS (
    SELECT 1
    FROM public.positions p
    WHERE p.user_id = t.user_id
      AND p.symbol = t.symbol
      AND p.is_paper = t.is_paper
      AND p.side = t.side
  );

-- Auto-reconciliation trigger: when a position row is deleted (i.e. the
-- position was fully closed and removed), mark any still-"open" trade
-- rows for the same user/symbol/side/mode as cancelled so reporting
-- stays consistent.
CREATE OR REPLACE FUNCTION public.reconcile_open_trades_on_position_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.trades
  SET
    status = 'cancelled',
    closed_at = COALESCE(closed_at, now()),
    exit_reason = COALESCE(exit_reason, 'auto_reconciled_position_closed')
  WHERE user_id = OLD.user_id
    AND symbol = OLD.symbol
    AND is_paper = OLD.is_paper
    AND side = OLD.side
    AND status = 'open';
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_open_trades_on_position_delete ON public.positions;
CREATE TRIGGER trg_reconcile_open_trades_on_position_delete
AFTER DELETE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_open_trades_on_position_delete();

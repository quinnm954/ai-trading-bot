## Goal

Force-close every open **paper** position right now (ICP, DOT, MKR×2, CAKE, ENS, AVAX, SOL — 8 positions) at current market price, credit the proceeds back to the $100k paper cash balance, and let the bot restart fresh under the tightened 1% TP / -1.5% SL rules.

## Approach

Create a new one-shot edge function `close-all-paper-positions` that:

1. Authenticates the caller (uses the user's JWT)
2. Pulls all `positions` rows where `is_paper = true` for the user
3. Fetches current USD prices for each symbol from CoinGecko (same source the bot already uses)
4. For each position:
   - Computes `exit_price = current_price`, `pnl = (current_price - avg_entry_price) * quantity`
   - Updates the matching open `trades` row: `status='closed'`, `exit_price`, `pnl`, `closed_at=now()`
   - Adds `current_price * quantity` to the paper account balance
   - Deletes the `positions` row
5. Inserts one `ai_decisions` row summarizing the cleanup (count + total realized P&L)
6. Returns a JSON summary

Add a small **"Close all paper positions"** button on the Dashboard (admin/creator-visible only, since this is a one-time cleanup tool) that calls the function with a confirm dialog.

## What this does NOT do

- Does **not** touch live positions
- Does **not** change `auto-take-profit` logic — the tightened 1% TP / -1.5% SL already applies to all new entries going forward
- Does **not** delete trades — losses stay on record, just marked closed at current market

## Expected outcome

- 8 positions closed at live prices
- Paper cash balance jumps back up (most positions are roughly break-even or small drawdown from entry)
- Bot starts the next scan cycle with a clean slate; every new entry will have the proper -1.5% stop enforced from the first tick

## Files touched

- New: `supabase/functions/close-all-paper-positions/index.ts`
- Edit: `src/pages/Dashboard.tsx` — add the cleanup button (creator-only, guarded by `useIsAdmin`)

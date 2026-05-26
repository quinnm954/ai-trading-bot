## Problem

The scalp entry filter (lines 1490–1530 of `ai-trading-engine/index.ts`) only checks **24-hour** price change (`change24h >= 0.5%` and `< 3%`). A coin can be "+0.8% 24h" but actively dumping right now — e.g. spiked 20 hours ago, dropping the last 30 minutes. We buy into the drop and immediately bleed.

True scalping needs **short-window upward momentum** (last few minutes rising), not a 24-hour average.

## Plan

### 1. Add short-window momentum to market data
- Extend `MarketData` with `change1h: number` and `change5m: number`.
- In the CoinGecko fetcher (line 1231), add `1h` to the `price_change_percentage` query (`24h,7d,1h`) and map `price_change_percentage_1h_in_currency` → `change1h`.
- In the Coinbase fetcher (line 1138 area), after building the base list, fetch a 5-minute candle (`/api/v3/brokerage/products/{id}/candles?granularity=FIVE_MINUTE&limit=3`) for each eligible candidate (only the ones that pass the price/stablecoin pre-filter, ~20-50 calls max) in parallel batches. Derive `change5m = (lastClose - prevClose) / prevClose * 100`. Cache results per-run.
- Default both to `0` if unavailable so we degrade gracefully.

### 2. Rewrite the scalp filter to require *current* upward momentum
Replace the `scalpCandidates` check with a multi-window momentum gate:
- `change5m > 0` (price tick is up right now) — **hard requirement** when available
- `change1h >= 0.2%` (the last hour is positive) — **hard requirement** when available
- `change24h >= 0.3%` and `< 3%` (not parabolic, not dumping on the day)
- Reject if `change5m <= 0` even if 1h/24h look good — this is the "buying the dip into a knife" guard the user is hitting.

Add a clear log per candidate: `🚫 SHORT-WINDOW DOWN: SYM 5m -0.4% / 1h +0.1% — skipping (falling knife)` so we can see in the edge function logs exactly why entries are rejected.

### 3. Rank surviving candidates by short-window strength
Sort the tradeable list by `change5m` desc then `change1h` desc, so the strongest *current* mover gets the slot first — not the strongest 24h mover.

### 4. Tighten the "not parabolic" rule for fast movers
Keep `change24h < 3%` cap, but also skip if `change5m > 1.5%` (already spiked in the last 5 min — too late to enter without chasing).

### 5. Verify
- Invoke `ai-trading-engine` and confirm the logs show `change5m / change1h` per candidate and that any candidate with negative 5m is rejected.
- Watch for a clean entry log: `✅ SCALP ENTRY: SYM 5m +0.6% 1h +0.4% 24h +1.2% — rising momentum`.
- Confirm no new live position opens while the asset is currently red on the 5-min chart.

### Technical notes
- File: `supabase/functions/ai-trading-engine/index.ts` only. No DB or UI changes.
- Coinbase candles endpoint is unauthenticated for read, but using the signed client we already have is fine; batch in groups of 5 to stay polite.
- Adds ~1–2s to engine cycle worst case (parallel fetches). Acceptable for scalping cadence.

# Raise scalp position cap from 5% → 15%

## Change

In `supabase/functions/ai-trading-engine/index.ts` line 19:

```ts
const SCALP_MAX_POSITION_PCT = 15; // was 5
```

## Effect

Per-scalp notional cap as % of equity:

| Equity | Old cap (5%) | New cap (15%) |
|---|---|---|
| $20k | $1,000 | $3,000 |
| $100k | $5,000 | $15,000 |

Combined with the notional-based logic just shipped:
- **1x spot:** margin up to 15% of equity per trade
- **5x leveraged:** notional up to 15% of equity → margin up to 3% of equity

The Risk panel's `Max Position Size` (default 10%, aggressive 15%) is still the AI's sizing ceiling. Aggressive Growth Mode users will now actually get the full 15% they ask for instead of being silently clipped to 5%.

## Risk note

This triples per-trade exposure. Daily-loss kill switch (default 8% in aggressive mode) still backstops the account, but drawdowns on bad days will be ~3× louder. Worth running in paper for a few sessions before live.

No DB migration, no UI change.

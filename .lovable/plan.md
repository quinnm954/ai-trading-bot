# Tie position cap to notional, not margin

## What changes

Today the engine clamps **margin used** to 5% of equity. With $20k equity that's $1,000 max per scalp regardless of leverage — which makes leverage pointless for sizing.

After this change, the 5% cap applies to **notional exposure** (margin × leverage). On spot/1x trades nothing changes. On leveraged trades the margin shrinks but the *market position* you control stays meaningful and predictable.

## Heads-up before I build

This is the literal "option 3" from my previous message, but I want to flag the tradeoff so you don't get a surprise:

- **Spot crypto (Coinbase) runs at 1x leverage.** Notional = margin. Your $1k cap **does not move** unless you're on the futures path.
- **Leveraged trades will use *less* margin per position** — e.g. on $20k equity at 5x, margin drops to $200 (controls $1k notional). That frees capital for more concurrent positions but each single position's margin is smaller, not bigger.

If what you actually want is **bigger positions overall**, the right lever is raising `SCALP_MAX_POSITION_PCT` from 5% → 10–15% (your "option 1"). I can do both in one pass if you want — say the word.

## Implementation

**File:** `supabase/functions/ai-trading-engine/index.ts` (around lines 4419–4440)

1. Keep `SCALP_MAX_POSITION_PCT = 5` (or raise — your call).
2. Change the hard-cap block so the comparison is against **notional**:
   ```ts
   const equityCap = equity * (SCALP_MAX_POSITION_PCT / 100);
   const notional = tradeValue * decisionLeverage;
   if (notional > equityCap) {
     const newMargin = equityCap / decisionLeverage;
     console.log(`🛡️ Scalp cap (notional): ${symbolUpper} notional $${notional.toFixed(2)} → $${equityCap.toFixed(2)}, margin $${tradeValue.toFixed(2)} → $${newMargin.toFixed(2)} @ ${decisionLeverage}x`);
     tradeValue = Math.max(newMargin, MIN_TRADE_VALUE);
   }
   ```
3. Update the comment block above the cap to describe the new behavior.
4. Update the engine's settings-summary log line (line ~4442) so it reads `per-pos ${SCALP_MAX_POSITION_PCT}% notional`.

No DB migration, no UI change, no other files touched.

## Verification

After deploy, check `daily-trade-audit` / engine logs for the new "🛡️ Scalp cap (notional)" line on the next leveraged scalp. On 1x trades the line shouldn't appear unless margin still exceeds 5% of equity.

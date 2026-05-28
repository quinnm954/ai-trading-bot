
# Titan AI: Precision Scalping + Sentiment Engine Upgrade

Refactor the trading engine around one principle: **"Not trading is better than bad trading."** Remove every code path that forces trades when no valid setup exists, and replace it with a regime-gated, confidence-scored, sentiment-aware pipeline.

---

## Scope of changes

All work happens in three edge functions plus one small UI badge. No schema changes.

- `supabase/functions/ai-trading-engine/index.ts` — main pipeline rewrite
- `supabase/functions/risk-manager/index.ts` — tighten per-trade + cooldown rules
- `supabase/functions/titan-fusion-engine/index.ts` — expose sentiment score for the scoring model (read-only consumer added in trading engine)
- `src/components/dashboard/MarketRegimeCard.tsx` — show new `STANDBY` / `NO-TRADE` state and current confidence threshold

No database migrations. Existing `ai_settings.current_regime`, `titan_fusion_signals`, and `risk_events` tables are reused.

---

## New pipeline (executed every cycle, in order)

```text
1. Regime detector            -> trending | ranging | high_vol | dead
2. If dead                    -> STANDBY, return []
3. Strategy selector by regime
     trending  -> momentum scalp
     ranging   -> mean-revert scalp / grid
     high_vol  -> strict breakout, half size
4. Candidate scan (Coinbase universe, meme/low-price filter respected)
5. Micro price-action filter  (breakout, S/R flip, liquidity grab,
                               continuation, rejection wick)
6. Momentum + volume filter   (rising vol, no single-spike, no exhaustion)
7. Confidence score 0-100     (weights below)
8. Polymarket sentiment       (boost / penalty, never sole trigger)
9. Threshold gate
     >= 70  -> full size
     60-69  -> half size
     < 60   -> NO TRADE
10. Risk manager validate     (stop required, cooldowns, drawdown)
11. Execute via limit order near liquidity, with hard SL
```

### Confidence scoring weights

| Input | Weight |
|---|---|
| Price-action setup quality | 25 |
| Volume confirmation | 20 |
| Momentum strength (multi-bar) | 15 |
| Spread + liquidity | 10 |
| Regime alignment | 15 |
| Polymarket sentiment alignment | 15 |

Sentiment can add up to +15 when aligned, subtract up to -15 when conflicting. Hard floor: score < 60 returns no trade regardless of other inputs.

---

## Removals (forced-activity logic)

- Cascading fallback chain `grid → scalp → ema_crossover` (already partly removed, finish the job).
- "Always pick a rising coin" fallback in `analyzeWithRules`.
- Any branch where `decisions = []` triggers a synthetic trade.
- Auto-rotation that fires solely because no positions are open.

Replaced with a single explicit `STANDBY` return path that logs `🛑 NO-TRADE: <reason>` and exits cleanly.

---

## Risk + frequency controls

- Risk per trade clamped to 0.5–2% of equity (was unbounded by user-set max position).
- Hard stop loss required on every order (paper + live).
- Per-symbol cooldown: 15 min after any exit, 60 min after a loss.
- Global cooldown: 5 min between any two entries.
- After 2 consecutive losses: position size halved for next 3 trades.
- Daily drawdown limit reads from `ai_settings.max_daily_loss`; on breach → STANDBY for rest of UTC day.

---

## Polymarket integration (signal booster only)

Trading engine pulls latest `titan_fusion_signals` row per symbol (already populated by `titan-fusion-engine`). Mapping:

- `direction === side` and `conviction >= 70` → +10 to +15 score
- `direction === side` and `conviction 50-69` → +5
- `direction` opposite of `side` and `conviction >= 60` → -15 (often pushes below threshold)
- No fresh signal (<6h) → neutral, no adjustment

Polymarket never opens a trade on its own.

---

## UI

`MarketRegimeCard` gains:
- `STANDBY` pill when engine returned no trades with reason
- Current confidence threshold (70) and last cycle's best score
- Small "Sentiment: bullish/bearish/neutral" line from latest fusion signal

Purely presentational, reads from existing tables.

---

## Out of scope (call out)

- New WebSocket feeds — keep current REST polling; mention as a follow-up.
- Order-book depth scoring — current spread proxy stays; flagged for a later pass.
- New Polymarket endpoints — reuse `polymarket-ai-score` + `titan-fusion-engine` already deployed.

---

## Verification

After deploy, watch one full cycle of `ai-trading-engine` logs and confirm:
1. A regime line is logged first
2. Either `🛑 NO-TRADE: <reason>` or a scored decision with `score=NN`
3. No `cascading to ...` lines remain
4. Risk-manager log shows cooldown / size-halving when applicable

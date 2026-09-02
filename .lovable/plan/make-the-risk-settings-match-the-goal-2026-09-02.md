# Make the risk settings match the goal

Goal being planned against: steady daily profit (the ~$200/day target) with capital preservation first, identical rules in paper and live, and net 1.6:1 reward:risk after the 0.8% fee round trip.

## What the live settings actually look like right now

Read from the database for both accounts:

| Setting | Account A | Account B | Preset it claims |
|---|---|---|---|
| Risk tolerance | aggressive | ultra_aggressive | — |
| Max leverage | 3x | 8x | 2x / 3x |
| Max position size | 10% | 40% | 20% / 30% |
| Max daily loss | 1.04% | 1.00% | 8% / 10% |
| Scalp slots | 4 | 4 | 12 / 20 |
| Trailing drop | 1.5% | 0.49% | 0.45% / 0.4% |
| Entry min 5m / 1h | 1.2 / 1.5 | 1.2 / 1.45 | 0.2 / 0.2 |
| Target position size | $20 | $288 | — |

Three concrete problems this creates:

1. **The self-tuner has drifted every account into a stand-down.** Its bounds let it push entry thresholds to 1.2–1.5%, cut slots to 4, and squeeze max daily loss to ~1%. With ~1% daily loss allowance, two stopped-out scalps end the trading day — that alone caps the account far below the daily target.
2. **The stated risk profile no longer matches the enforced numbers.** Leverage 8x and position size 40% exceed the preset the account is labelled with, and both exceed the engine's own hard caps (15% notional per position, 12 slots), so the UI shows limits that never apply.
3. **Trailing drop of 1.5% on Account A gives back more than the net win.** A 3.36% gross target nets ~2.56%; a 1.5% trail hands back well over half of a winner before it can hit target.

## The fix

**1. Bound the self-tuner to values that can still reach the goal**
- Entry thresholds: cap the pickiness ceiling at 0.6% (5m/15m) and 0.8% (1h) instead of 1.2/1.5, so a cold streak slows entries instead of stopping them.
- Slots: floor at 6, ceiling at 12 (matching the engine's hard cap) instead of 4–18.
- Trailing drop: ceiling 0.6% instead of 1.5%, floor 0.3%.
- Max daily loss: floor at 3% instead of 1%, so risk-off tightens the day without closing it.
- Leave the stop-loss logic exactly as is — it may only tighten, and 0.8% stays the hard cap.

**2. Make the presets honest and goal-consistent**
Rewrite the four presets in the risk panel so no preset exposes a limit the engine will silently override:
- Leverage capped at 1x (conservative/moderate), 2x (aggressive), 3x (ultra) — and clamp the saved value to the engine's real ceiling.
- Max position size capped at 15% for every preset (the engine's per-position notional cap).
- Slots capped at 12 for every preset.
- Trailing drop 0.4–0.5%, stop ≤0.8%, target solved from the shared net-R:R formula — unchanged.
- Max daily loss: 3 / 4 / 5 / 6% — still capital-preservation first, but not self-cancelling.

**3. Re-align both existing accounts once**
Apply the corrected preset for each account's stated tolerance, so leverage, position size, slots, daily loss, trailing drop, and entry thresholds all land back inside the new bounds instead of waiting for the tuner to walk them back.

**4. Show what is actually enforced**
On the Risk Management page, display the effective limit next to each slider when the engine's hard cap is lower than the chosen value (e.g. "40% → 15% enforced"), so a mismatch can never hide again.

## Technical notes

- `supabase/functions/ai-trading-engine/index.ts` — adjust only the `clamp` bounds in the adaptive-tune block (entry thresholds, `max_concurrent_positions`, `trailing_drop_pct`, `max_daily_loss`). No change to sizing, entry logic, or exit geometry.
- `src/components/risk/RiskSettingsPanel.tsx` — rewrite `RISK_PRESETS`, clamp `maxLeverage`/`maxPositionSize`/`maxConcurrentTrades` on save, add the "enforced" hint to `Row`.
- Exit geometry keeps coming from `supabase/functions/_shared/exit-geometry.ts` and its client mirror — targets and stops are not changed by this plan.
- One data update to `ai_settings` and `scalp_settings` for the two existing accounts.

## What this does not promise

Tightening the settings makes the goal reachable at the modelled win rate; it does not create edge. Expectancy stays the gate — if it is negative, the engine still sizes down and stands down.

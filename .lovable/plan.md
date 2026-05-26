
# TitanAI → Professional Scalping Platform

Audit first, then a phased upgrade that keeps every existing feature.

## 1. What you already have that matches the standard

| Requirement | Already in app |
|---|---|
| AI confidence scoring | `ai-trading-engine` produces `confidence` 0–1 with regime multipliers, MIN_CONFIDENCE gate |
| Trade reasoning | `ai_decisions` + `pending_trades.ai_reasoning` populated for every signal |
| Risk management | `risk-manager` edge function + `RiskManagement.tsx` page (daily loss, drawdown, kill switch, live confirmation phrase) |
| Paper trading | `paper_account` ($100k), `positions`, `trades(is_paper)`, reset button |
| Strategy registry | `strategy_performance` table seeded with 10 strategy/regime rows, learning engine updates scores |
| Bot status | `ai_settings.bot_status` (idle/learning/trading) + `SafetyStatusCard` |
| Dashboard cards | Equity, positions, recent trades, market regime, milestones, safety status |
| Trade history | `Trades.tsx` page reads from `trades` |
| Compliance | `LegalAndPrivacy.tsx` already shows risk disclosures |
| Live trading lock | Live mode requires typed confirmation in `LiveModeConfirmDialog` |
| Auto take-profit / trailing stop | `auto-take-profit` edge function |
| Cooldown after trade | Already in `ai-trading-engine` (6h cooldown, loss cooldown) |

## 2. Gaps vs the standard

| Gap | Why it matters |
|---|---|
| **No 0–100 score** — confidence is 0–1, derived mostly from pattern type, not from EMA/RSI/MACD/VWAP/volume/SR/volatility/RR factors with weights | Required scoring rubric |
| **No factor breakdown** stored — only a single number | Can't explain *why* the score is what it is |
| **No "Valid" gate** = score ≥ 75 **and** RR ≥ 1.5 | Required filter |
| **No structured trade explanation panel** — reasoning is a text blob | Spec wants entry/SL/TP/RR/score/risk/strategy fields |
| **No backtesting page** — learning engine runs but no user-facing backtest results UI | Spec item 5 |
| **No Strategy Control Center** — strategies aren't toggleable; the 6 required types (EMA crossover, RSI reversal, VWAP bounce, Breakout w/ volume, Pullback continuation, Trend scalp) aren't all present | Spec item 6 |
| **No Trade Journal with filters** — `Trades.tsx` is a flat list | Spec item 9 |
| **Dashboard cards missing**: Win rate, Max drawdown, Active strategy, Market volatility, Last signal, Account risk exposure | Spec item 8 |
| **Trade rows missing fields**: fees/slippage estimate, confidence at entry, exit reason, duration | Spec item 4 |
| **Safety status states incomplete** — currently green/yellow only; needs Caution / High volatility / Daily limit hit / Paused / Paper-only / Live-disabled | Spec item 7 |

## 3. Database changes

Add columns to existing tables (non-breaking):

```text
trades         + confidence, score, exit_reason, fees_estimate,
                 slippage_estimate, duration_seconds, risk_reward,
                 entry_reasoning, stop_loss_price, take_profit_price
ai_decisions   + score (0-100), factor_scores jsonb, risk_reward,
                 valid boolean
strategy_performance + enabled boolean default true,
                       max_drawdown, profit_factor, best_trade,
                       worst_trade, avg_win, avg_loss
```

New tables:

```text
signal_scores       per-signal factor breakdown
                    (ema_alignment, rsi, macd, vwap, volume, sr,
                     volatility, risk_reward, total_score, valid)
backtest_runs       symbol, strategy, timeframe, period,
                    total_return, win_rate, max_drawdown,
                    profit_factor, trades_count, best_trade,
                    worst_trade, avg_win, avg_loss, created_at
trade_journal_notes user notes attached to trades
```

All with RLS scoped to `auth.uid()` and proper `GRANT`s.

## 4. Pages / components to edit or add

**Edit (no removals):**
- `src/pages/Dashboard.tsx` — add Win Rate, Max DD, Active Strategy, Volatility, Last Signal, Risk Exposure cards
- `src/components/dashboard/SafetyStatusCard.tsx` — expand to 7-state machine
- `src/pages/Trades.tsx` — convert to Trade Journal with filters
- `src/pages/RiskManagement.tsx` — add hard-rule indicators (3-loss stop, no-SL block, cooldown timer, emergency pause)
- `supabase/functions/ai-trading-engine/index.ts` — replace ad-hoc confidence with weighted 0–100 scorer using EMA9/21/50, RSI, MACD, VWAP, volume spike, SR, ATR, RR
- `supabase/functions/risk-manager/index.ts` — enforce no-SL rejection, 3-consecutive-loss pause, 0.5–1% risk cap

**Add:**
- `src/pages/Backtesting.tsx` + `supabase/functions/backtest-runner/index.ts`
- `src/pages/StrategyControlCenter.tsx` (admin)
- `src/components/trading/SignalScorePanel.tsx` — factor breakdown card
- `src/components/trading/TradeExplanation.tsx` — structured entry/exit panel
- `src/components/compliance/ScalpingDisclaimer.tsx` — top-of-app warning banner

## 5. Broken / placeholder spots noticed during scan

- `SafetyStatusCard` is hardcoded to green/yellow with `dailyLossUsed = 0` — never actually computes used loss.
- Pricing route is disabled in `App.tsx` (intentional, leaving as-is).
- `LeverageTrading` ticket page has trade buttons disabled (no live wiring yet — intentional per last task).

## 6. Phased rollout (one DB migration per phase, no big-bang)

**Phase A — Foundation (DB + scoring engine)**
1. Migration: add columns + new tables listed in §3
2. New `lib/signalScoring.ts` shared scorer (TS) and Deno port for edge function
3. Wire `ai-trading-engine` to compute the 0–100 score, factor breakdown, RR; persist to `signal_scores` and `pending_trades`
4. Risk-manager hard rules: reject if no SL, if score < 75, if RR < 1.5, if 3 losses in a row, if daily loss ≥ 3%

**Phase B — Visibility**
5. `SignalScorePanel` + `TradeExplanation` components
6. Dashboard: 6 new stat cards
7. Expanded `SafetyStatusCard` (7 states)
8. `ScalpingDisclaimer` mounted in `AppLayout`

**Phase C — Journal & Backtesting**
9. Trade Journal filters in `Trades.tsx`
10. `Backtesting` page + `backtest-runner` edge function (runs strategies over historical CoinGecko klines)
11. `StrategyControlCenter` admin page; respects `strategy_performance.enabled` in the trading engine

## What stays untouched
- All branding, sidebar nav, existing routes
- Lovable Cloud schema for paper/live accounts, copy trading, moonshot, crypto signals, leverage module, subscriptions, invites, admin
- Auto take-profit, learning engine, milestone tracking, Coinbase integration
- Mobile responsiveness — every new component uses existing Tailwind tokens and the responsive grid patterns already in place

## Technical notes (for reviewers)

Scoring formula (weighted, normalized to 0–100):

```text
score = 18·trend + 14·ema_align + 12·rsi + 10·macd + 10·vwap
      + 12·volume + 8·sr + 8·volatility + 8·risk_reward
valid = score >= 75 AND risk_reward >= 1.5 AND stop_loss != null
```

Backtester runs candle replay against the same scorer to keep paper, live, and backtest decisions identical — single source of truth.

---

Approve and I'll start with **Phase A** (DB migration + scorer). Or tell me which phase to skip / reorder.

## Penny Stock Scanner Module

A new, isolated module added to TitanAI alongside existing crypto features. Paper-trading only by default; live trading gated behind admin unlock.

### What gets built

**1. New page & route** — `/penny-stocks` with sidebar/bottom-nav entry
- Tabs: Scanner · Signals · Setups · Paper Trades · Performance · Settings
- Top banner disclaimer: "Penny stocks are extremely risky, highly volatile, and often illiquid. TitanAI does not guarantee profits. Paper trade first."

**2. Scanner UI** with filters
- Price < $1 (locked), min volume, relative volume, float size, market cap range
- Exchange checkboxes: NASDAQ, NYSE, AMEX (OTC disabled by default with warning toggle)
- Result table: symbol, price, %chg, volume, rel-vol, float, spread%, catalyst tag, warning flags

**3. Bad-stock filters** (auto applied, shown as warning chips on each row)
- Low volume, wide spread, reverse-split risk, dilution flag, OTC-only, pump-spike pattern, no catalyst, repeated offerings

**4. Signal Engine** (`src/lib/pennyStockScoring.ts`)
- 0–100 weighted score across: relative volume, news catalyst, breakout, VWAP reclaim, EMA trend, momentum, float, spread, liquidity
- Valid gate: score ≥ 80, spread acceptable, strong volume, stop loss set, R/R ≥ 2:1
- Mirrors structure of existing `signalScoring.ts`

**5. Setup detectors** (`src/lib/pennyStockSetups.ts`)
- VWAP reclaim, high rel-vol breakout, pre-market gapper continuation, first pullback after breakout, support bounce, momentum scalp

**6. Risk rules** (penny-stock-specific, separate from crypto risk)
- Max risk/trade: 0.25%–0.5% (slider), no averaging down, no trading during halts, no overnight holds (auto-close at session end), pause after 2 consecutive losses, 2% daily loss limit, emergency pause button

**7. Paper trades table** tracks: entry, exit, P&L, slippage, spread cost, volume at entry, strategy, entry reason, exit reason

**8. Dashboard widgets**
- Top movers under $1, highest rel-vol, news-catalyst list, biggest-spread warnings, halt-risk warnings, active setups, paper performance summary

**9. Broker placeholder card** — Alpaca / IBKR / Tradier listed as "Coming soon — admin unlock required"; live trading toggle disabled

### Technical details

**New tables (migration):**
- `penny_stock_settings` — per-user filters, risk params, paper-only flag
- `penny_stock_signals` — scanned candidates with score, factors, warnings, catalyst
- `penny_stock_trades` — paper trades with slippage/spread/volume columns

**New edge function:** `penny-stock-scanner`
- Fetches under-$1 US equities (uses existing `stock-data-provider` pattern; Alpaca-compatible mock data initially with clear TODO for real provider key)
- Computes scores, persists top candidates to `penny_stock_signals`
- Runs on-demand from UI button (no cron initially)

**Frontend files:**
- `src/pages/PennyStocks.tsx` (page shell + tabs)
- `src/components/penny/ScannerTable.tsx`
- `src/components/penny/SignalRow.tsx`
- `src/components/penny/RiskRulesPanel.tsx`
- `src/components/penny/PaperTradesPanel.tsx`
- `src/components/penny/BrokerPlaceholderCard.tsx`
- `src/hooks/usePennyStockScanner.ts`
- `src/lib/pennyStockScoring.ts`, `src/lib/pennyStockSetups.ts`

**Untouched:** all crypto code, dashboards, trading engine, existing risk manager. Penny stocks are a parallel module with its own data + own UI.

### Out of scope (call out)
- Real live-trading execution to Alpaca/IBKR/Tradier — placeholders only until admin unlock
- Real-time news catalyst feed — initial version uses a simple flag from scanner data; a real news API can be wired later
- Cron-based auto-scanning — first version is manual scan button

After you approve, I'll run the migration first, then build the module.

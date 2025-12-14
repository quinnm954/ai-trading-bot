# TitanAI Patent Architecture Reference

## USPTO Provisional Patent Application

**Title:** AUTOMATED MULTI-ASSET TRADING PLATFORM WITH ADAPTIVE INTELLIGENCE AND CAPITAL PRESERVATION

This document maps the patent claims to their implementation in the TitanAI codebase.

---

## Patent Claims Implementation

### Claim 1: Multi-Asset Class Trading Capability

**Patent Language:** "A system capable of trading across multiple asset classes including but not limited to equities, cryptocurrencies, forex, and commodities."

**Implementation Status:** Fully Implemented

**Code Locations:**
- `src/types/trading.ts` - Asset-agnostic type definitions with `allowedMarkets` supporting stocks/crypto
- `supabase/functions/ai-trading-engine/index.ts` - Multi-broker trade routing
- Database: `market_type` enum with `stocks | crypto` values

**Supported Brokers:**
- **Stocks:** Alpaca, Interactive Brokers (IBKR), Tradier
- **Crypto:** Coinbase

**Architecture Notes:**
The system uses asset-class-agnostic interfaces that abstract exchange-specific logic. Trade routing automatically selects the appropriate broker based on asset type and user connections.

---

### Claim 2: Asset-Aware Intelligence

**Patent Language:** "An AI trading engine that applies asset-class-specific trading logic, adapting strategies and parameters based on the unique characteristics of each asset class."

**Implementation Status:** Fully Implemented

**Code Locations:**
- `supabase/functions/ai-trading-engine/index.ts` - Asset-aware analysis with market hours detection
- `src/types/trading.ts` - MarketRegime detection for condition-based trading
- `src/lib/stockMarketHours.ts` - Stock market hours, sessions, and holiday detection
- `src/components/trading/StockMarketIndicator.tsx` - UI for market hours display
- `src/components/trading/PDTWarning.tsx` - Pattern Day Trader rule warnings

**Asset-Specific Logic:**
- **Crypto:** 24/7 trading, high volatility handling, precision mapping for 100+ coins
- **Stocks:** Market hours awareness (pre-market, regular, after-hours), PDT rule compliance, lot-based trading

---

### Claim 3: Selectable Execution Control Modes

**Patent Language:** "A user-selectable execution mode system allowing choice between autonomous AI execution and user-confirmed trade approval."

**Implementation Status:** Fully Implemented

**Code Locations:**
- `src/components/trading/ExecutionModeToggle.tsx` - Mode selection UI
- `src/hooks/usePendingTrades.ts` - Pending trade management
- `src/components/trading/PendingTradesPanel.tsx` - Trade approval interface
- Database: `execution_mode` column in `ai_settings` table
- Database: `pending_trades` table for queued proposals

**Execution Modes:**
1. **Autonomous:** AI executes trades automatically based on analysis
2. **User-Confirmed:** All trades queued for user approval before execution

---

### Claim 4: Capital Preservation Controls

**Patent Language:** "A comprehensive risk management system with configurable limits including position sizing, daily/weekly loss limits, maximum drawdown thresholds, and automatic kill switch functionality."

**Implementation Status:** Fully Implemented

**Code Locations:**
- `supabase/functions/risk-manager/index.ts` - Central risk gatekeeper
- `src/types/trading.ts` - RiskSettings and SafetyGovernor interfaces
- `src/pages/RiskManagement.tsx` - Risk configuration UI
- `src/hooks/useRiskManager.ts` - Client-side risk management

**Risk Controls:**
- Maximum position size (% of equity)
- Maximum daily loss limit
- Maximum weekly loss limit
- Maximum drawdown threshold
- Maximum concurrent positions
- Maximum capital utilization
- Automatic kill switch on threshold breach

---

### Claim 5: Dual-Environment Trading Architecture

**Patent Language:** "A dual-environment architecture separating simulated paper trading from live trading, with mandatory confirmation for live mode activation."

**Implementation Status:** Fully Implemented

**Code Locations:**
- Database: `trading_mode` column (`paper | live`)
- `src/components/risk/LiveModeConfirmDialog.tsx` - Live mode confirmation
- AI Learning Engine operates exclusively on paper environment

**Security Features:**
- Live mode requires typed phrase confirmation
- Paper trading default for all new strategies
- Clear visual indicators for trading mode

---

### Claim 6: No Custody of User Funds

**Patent Language:** "An architecture where the platform never holds custody of user funds; all trading occurs through user-owned broker accounts via secure API connections."

**Implementation Status:** Fully Implemented

**Code Locations:**
- `src/types/trading.ts` - ApiKey interface
- `supabase/functions/sync-broker-balances/index.ts` - Balance synchronization
- Database: `api_connections` table

**Supported Brokers:**
- **Stocks:** Alpaca, Interactive Brokers (IBKR), Tradier
- **Crypto:** Coinbase

**Custody Model:**
- Users connect their own broker accounts via secure API credentials
- TitanAI syncs balances via read-only or trading APIs
- All funds remain in user's broker account at all times
- No funds are ever transferred to or held by TitanAI

---

### Claim 7: Adaptive Market Intelligence

**Patent Language:** "A market regime detection system that classifies market conditions and automatically adjusts strategy selection based on detected regimes."

**Implementation Status:** Fully Implemented

**Code Locations:**
- `src/types/trading.ts` - MarketRegime type definition
- `supabase/functions/ai-trading-engine/index.ts` - Regime detection logic
- Database: `strategy_performance` table tracks per-regime performance

**Market Regimes:**
- `trending` - Directional price movement
- `ranging` - Sideways consolidation
- `high_volatility` - Elevated price swings
- `low_volatility` - Compressed price action
- `news_driven` - Event-based market behavior

---

### Claim 8: Learning Engine

**Patent Language:** "A continuous learning system that backtests strategies, tracks performance by market regime, and optimizes parameters without risking real capital."

**Implementation Status:** Fully Implemented

**Code Locations:**
- `supabase/functions/ai-learning-engine/index.ts` - Learning engine
- `src/types/trading.ts` - LearningState interface
- Database: `strategy_performance` table

**Learning Capabilities:**
- Backtesting on historical data
- Per-regime strategy scoring
- Parameter optimization
- Operates exclusively on paper trading

---

## File Reference Map

| Patent Concept | Primary File(s) |
|---------------|-----------------|
| Multi-Asset Types | `src/types/trading.ts` |
| Execution Modes | `src/components/trading/ExecutionModeToggle.tsx` |
| Risk Management | `supabase/functions/risk-manager/index.ts` |
| Trade Execution | `supabase/functions/ai-trading-engine/index.ts` |
| Learning Engine | `supabase/functions/ai-learning-engine/index.ts` |
| Safety Governor | `src/types/trading.ts` (SafetyGovernor interface) |
| Pending Trades | `src/hooks/usePendingTrades.ts` |
| Broker Sync | `supabase/functions/sync-broker-balances/index.ts` |

---

## Architecture Principles

1. **Fail-Safe Design:** When uncertain, the system protects capital by halting operations
2. **Capital Preservation First:** Risk management takes precedence over profit seeking
3. **User Control:** All automated actions are constrained by user-defined limits
4. **No Fund Custody:** Platform operates as a tool, never a custodian
5. **Transparency:** All AI decisions are logged with reasoning
6. **Extensibility:** Architecture supports addition of new asset classes and brokers

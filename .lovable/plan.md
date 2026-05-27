# Aligning Titan AI to the Roadmap

I audited the codebase against your 3-stage picture. Here's the gap analysis and what I'll build.

## Audit vs. roadmap

**Stage 1 — Coinbase scalper** ✅ Complete
- trend scalping (ema_crossover, macd, trend_breakout) ✅
- breakout scalping (volatility_breakout) ✅
- volatility detection (shared volatility profile) ✅
- risk engine (risk-manager) ✅

**Stage 2 — Polymarket intelligence** ⚠️ Partial
- sentiment feed ✅ (just shipped `polymarket-signals`)
- event scanner ❌ — no countdown / high-impact filter
- AI confidence scoring ❌

**Stage 3 — AI fusion** ⚠️ Partial
- Polymarket sentiment ✅
- liquidation maps ✅
- technicals ✅ (in trading engine)
- volume analysis ✅ (moonshot + learning)
- X/Twitter trends ❌ (only CoinGecko-derived sentiment, not social)
- news feeds ❌
- **Fusion layer** ❌ (no single AI call combining all signals into one conviction)

## What I'll build

### 1. Polymarket event scanner + AI confidence (Stage 2)
- Extend `polymarket-signals` to flag **high-impact crypto events** within next 30 days (ETF rulings, halvings, SEC decisions) using volume + keyword filters
- New edge function `polymarket-ai-score` calls Lovable AI (gemini-3-flash-preview) on each event → returns `{ conviction: 0-100, direction: bullish/bearish/neutral, rationale }` for BTC/ETH/SOL
- Cache scores in new `polymarket_event_scores` table (1h TTL)
- UI: new "Event Scanner" sub-tab inside the Polymarket card showing event + countdown + AI conviction badge

### 2. News feed ingestion (Stage 3)
- New edge function `crypto-news-scanner` pulls CryptoPanic-style free RSS (CoinDesk + Cointelegraph + Decrypt public feeds — no key needed)
- Stores latest 50 items in new `news_feed` table with `symbols[]`, `sentiment` (lightweight keyword), `published_at`
- Cron every 15 min
- UI: new "News" tab on Crypto Signals page

### 3. X/Twitter trends (Stage 3)
- Twitter's public API now requires a paid key. Options:
  - **(a) Skip for now** — keep CoinGecko-derived sentiment as proxy and label it "Social Proxy" honestly
  - **(b) Add later** — wire a `TWITTER_BEARER_TOKEN` secret when you're ready
- I'll go with **(a)** by default and leave a clean stub; tell me if you want me to set up (b) now.

### 4. Titan AI Fusion engine (Stage 3 — the headline piece)
- New edge function `titan-fusion-engine` runs every 5 min, per top-20 crypto:
  1. Pulls Polymarket conviction (from #1)
  2. Pulls news sentiment (from #2)
  3. Pulls liquidation map proximity
  4. Pulls technicals from trading engine (RSI, EMA, volatility)
  5. Pulls volume analysis
  6. Calls Lovable AI with all features → single JSON: `{ symbol, conviction: 0-100, direction, top_drivers: [...], horizon }`
- Stores in new `titan_fusion_signals` table
- AI trading engine reads these as an additional gate (high conviction can boost size within risk caps; low conviction blocks)

### 5. Titan AI Fusion dashboard
- New page `/fusion` (or new tab on Dashboard) showing the top 10 fusion signals ranked by conviction
- Each row: symbol, conviction bar, direction arrow, top 3 drivers (chips), AI rationale tooltip
- Auto-refresh every 60s

## Files

**New edge functions**: `polymarket-ai-score`, `crypto-news-scanner`, `titan-fusion-engine`
**New tables**: `polymarket_event_scores`, `news_feed`, `titan_fusion_signals`
**New UI**: `src/pages/Fusion.tsx`, `src/components/trading/FusionSignalCard.tsx`, `src/components/trading/NewsFeedCard.tsx`, `src/hooks/useTitanFusion.ts`, `src/hooks/useCryptoNews.ts`
**Edits**: `polymarket-signals` (event scanner mode), `ai-trading-engine` (fusion gate), `CryptoSignals.tsx` (News tab), `App.tsx` (route), nav sidebar

## Out of scope
- Paid X/Twitter API (skipping until you confirm — option 4(b) above)
- Changes to scalping strategies, risk caps, live execution, paper defaults

## Estimated impact
~3 new tables, 3 new edge functions, ~6 new frontend files, 1 new page. Existing scalper + risk engine untouched.

Approve to build, or tell me which sub-pieces to skip.
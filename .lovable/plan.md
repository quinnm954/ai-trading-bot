## Simplify App — Moderate Pass (3/5)

Goal: cleaner default experience for new users, less noise for the creator, no behavior changes to the trading engine. All "power" features stay reachable, just tucked away.

---

### 1. Navigation — 12 items → 6 (+ Advanced group)

Current sidebar has 12 entries. New structure:

**Primary (always visible)**
- Dashboard
- AI Trader *(merges `/ai-trader` + `/ai-advisor` into one tabbed page; default tab = Autonomous)*
- Strategies
- Risk
- Trade History
- Settings *(absorbs API Keys + Pricing as tabs)*

**Advanced (collapsible group, collapsed by default)**
- AI Learning
- Moonshot Scanner
- Crypto Signals

No routes are deleted — `/ai-advisor`, `/api-keys`, `/pricing` still resolve so existing links work. Just removed from the primary sidebar list.

---

### 2. Features — keep all, hide noise

- Remove "NEW" / "AUTO" / 🚀 badges from sidebar (visual noise).
- Settings page gets tabs: **General · API Keys · Billing · Advanced**.
- AI Trader page gets tabs: **Autonomous · Advisor**.
- No edge functions deleted, no DB tables dropped.

---

### 3. Strategies page — surface the 2 that matter

Today: 8 strategy cards shown flat. New:
- Top section: 2 recommended strategies (Trend-Follow + Mean-Reversion) with clear ON/OFF toggle.
- Collapsible "All strategies (6 more)" panel for the rest.
- Strategy engine itself is unchanged.

---

### 4. Risk settings — one slider up front

Today: 4 tolerance profiles + many fields. New:
- **Simple view (default):** one risk tolerance selector (Conservative · Balanced · Aggressive) — maps to existing profiles. Shows the 3 numbers that matter: max position size, daily loss limit, max concurrent trades.
- **Advanced view (toggle):** the full current form, unchanged.
- Risk page remains single source of truth (memory rule preserved).

---

### Technical notes

```text
src/components/layout/Sidebar.tsx     → restructure NAV_ITEMS, add collapsible group
src/pages/AITrader.tsx                → wrap content in Tabs, import AIAdvisor body
src/pages/Settings.tsx                → Tabs: general / api-keys / billing / advanced
                                        re-use existing ApiKeys + Pricing components
src/pages/Strategies.tsx              → split list: recommended[2] + collapsible rest
src/pages/RiskManagement.tsx          → Simple/Advanced toggle, simple = 3 fields +
                                        profile picker mapping to existing config
```

No changes to:
- `supabase/functions/*` (trading engine untouched)
- DB schema / RLS
- Auth, paper/live mode, kill-switch, trailing stops

---

### Out of scope (ask separately if you want them)

- Removing strategies from the engine
- Deleting Moonshot / Crypto Signals features
- Changing pricing tiers or trial flow
- Visual redesign / theme changes

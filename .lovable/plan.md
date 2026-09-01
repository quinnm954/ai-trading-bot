# Single Plan Pricing + Subscription-Aware Profit Accounting

## What it costs to run (per active user, per month)

Measured from what the app actually calls:

- **AI decisions** — `ai-trading-engine` (Gemini 2.5 Flash), `titan-fusion-engine` (Gemini 3.5 Flash), `agent-orchestrator`, `ai-strategy-advisor` (GPT-5.4). At a 30-minute agent cycle that is roughly 1,400 cycles/month per user. Flash-class calls dominate and are cheap; the GPT-5.4 advisor is the expensive one and is only called on demand.
  - Estimate: **$0.15 – $0.60 / user / month** on Flash-only cycles; each GPT-5.4 advisor request adds a few cents.
- **Backend (Lovable Cloud)** — edge function invocations, Postgres, cron. Shared across all users; the workspace gets 20 free credits/month of Cloud and 4 free credits/month of AI, so the first handful of users are effectively free. Current period usage is 22 credits total.
- **Market data** — CoinGecko / CoinCap / DefiLlama free tiers today. If user count grows, CoinGecko Pro is ~$129/mo *flat*, not per user.
- **Email** — Resend free tier covers low volume.
- **Payment processing** — Stripe ~2.9% + 30¢ per charge.

**Conclusion:** marginal cost is well under $1/user/month; the real risk is flat costs (paid market-data tier) once you scale. A single **$29/month** plan leaves a very wide margin and is affordable. The plan below makes the price a single constant so you can change it in one place.

## Decisions locked in

- One paid plan only. No Pro/Unlimited split, no per-tier feature gating.
- 7-day free trial stays: paper trading during trial, subscription unlocks live trading and everything else.
- Checkout is **Apple Pay / Google Pay first**: the wallet buttons are the primary way to pay, with card as fallback. Those wallet buttons are rendered and settled by the payment processor behind checkout — that is the only way Apple Pay and Google Pay work on the web — and money settles to your bank account.
- Existing admin/invite free access is preserved. Current paid subscribers are not auto-granted anything; they move onto the single plan.

## What changes

### 1. Collapse tiers to one plan
- `useSubscription`: replace `SubscriptionTier = 'free' | 'pro' | 'unlimited'` with a simple `hasLicense` / `subscribed` model. `canAccess` becomes: free access OR active subscription OR (in-trial AND paper-only feature). Drop `canAddBroker` tier limits — unlimited brokers for subscribers.
- Database: rewrite `can_use_feature` and `get_user_subscription_tier` to a single active/inactive check; keep the `subscriptions` table but treat `tier` as always `'pro'`-equivalent single value.
- Remove tier UI: `SubscriptionManager` shows one plan with status + renewal date + manage/cancel; `UpgradePrompt` and `TrialExpiredOverlay` point at the single plan.

### 2. Rewrite the Pricing page
- Two columns only: **Free 7-Day Trial** and **Full Access — $29/month**. Everything the app can do goes in the paid column. Remove the three-tier comparison table and tier dropdowns.
- Single `MONTHLY_PRICE_USD` constant sourced by Pricing page, Settings, and the checkout function.

### 3. Stripe Checkout with wallets
- Enable Lovable's built-in Stripe payments, create one recurring monthly product/price.
- New edge function `create-checkout` (subscription mode, wallets enabled) and `customer-portal` for cancel/payment-method changes; `check-subscription` verifies against Stripe on login/page load and writes `subscriptions`.
- Retire the manual Cash App flow: remove `CashAppPaymentDialog` and the payment-claim UI path from the purchase flow (keep `payment_claims` table and admin approve/reject RPCs intact so historical claims stay readable).

### 4. Subscription-aware profit accounting
Because it's a monthly fee, net profit has to be shown after the fee:
- New `SubscriptionCostCard` on the dashboard and a fee row in the Trades monthly summary:
  - Gross realized P&L for the current calendar month
  - Minus trading fees already tracked (0.8% round-trip)
  - Minus the $29 subscription fee for the month
  - **Net profit after subscription** with a clear break-even line ("you need $29 of realized profit this month to cover the plan")
- Same math for paper and live so the number is honest in both modes.

## Technical notes

- Price constant lives in `src/lib/pricing.ts`, imported by frontend and mirrored in the checkout function's env/price id.
- Migration: single SQL migration to rewrite the two tier-checking DB functions; no table drops.
- Files touched: `src/pages/Pricing.tsx`, `src/hooks/useSubscription.ts`, `src/components/settings/SubscriptionManager.tsx`, `src/components/subscription/*`, plus new `create-checkout` / `customer-portal` / `check-subscription` edge functions and a new dashboard cost card.
- Apple Pay / Google Pay require the checkout domain to be the published domain; Stripe handles wallet enablement, no extra SDK in the app.

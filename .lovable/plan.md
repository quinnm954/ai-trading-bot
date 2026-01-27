
# 7-Day Free Trial Implementation Plan

## Overview
Implement a time-limited free trial that gives new users full access to **all free tier features** (paper trading, AI advisor, basic strategies) for 7 days. After the trial expires, users will need to upgrade to continue using the platform.

---

## How It Will Work

### Trial Period Behavior
- **Day 1-7**: Full access to all free tier features (paper trading, AI advisor, strategies)
- **After Day 7**: Features locked with upgrade prompt, user must subscribe to Pro or Unlimited

### Who Gets Trials
- All new signups automatically start with a 7-day trial
- Users with **paid subscriptions** (Pro/Unlimited) are never affected
- Users with **free access via invite** are never affected (admin/invited users)

---

## Technical Changes

### 1. Database: Track Trial Start Date

Add a `trial_started_at` column to the `user_roles` table to track when each user's trial begins:

```sql
ALTER TABLE public.user_roles 
ADD COLUMN trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT now();
```

Update the `handle_new_user_setup` trigger to set this automatically for new users.

---

### 2. Subscription Hook Updates

Modify `useSubscription.ts` to:
- Fetch the user's `trial_started_at` from `user_roles`
- Calculate days remaining in trial
- Add new state: `trialDaysRemaining`, `isTrialExpired`, `isInTrial`
- Update `canAccess()` to block features when trial expired

New logic flow:
```text
1. User has active subscription? → Full access (based on tier)
2. User has free access (invite/admin)? → Full access
3. User within 7-day trial? → Access to free tier features
4. Trial expired? → Block all features, show upgrade prompt
```

---

### 3. Enhanced Upgrade Prompt

Create a new **TrialExpiredOverlay** component that:
- Shows a full-screen modal when trial expires
- Displays: "Your 7-day free trial has ended"
- Shows benefits of upgrading
- Has prominent upgrade buttons for Pro ($49/mo) and Unlimited ($99/mo)
- No option to dismiss (must upgrade or stay locked out)

---

### 4. Trial Status Banner

Add a persistent banner component showing:
- During trial: "7 days remaining in your free trial" (countdown)
- Last 3 days: More urgent styling (amber/warning color)
- Last day: Critical styling (red/danger color)
- After expiry: "Trial expired - Upgrade to continue"

This banner will appear on the Dashboard and throughout the app.

---

### 5. App Layout Integration

Modify `AppLayout.tsx` to:
- Check trial status on every page load
- Show the trial banner at the top of the app
- Show the expired overlay when trial is over

---

### 6. Edge Function Updates

Update `check-subscription` edge function to:
- Return trial status information
- Include `trial_started_at` and `trial_expired` in response

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `user_roles` table | Migrate | Add `trial_started_at` column |
| `handle_new_user_setup` | Migrate | Set trial start for new users |
| `src/hooks/useSubscription.ts` | Modify | Add trial logic and state |
| `src/components/subscription/TrialBanner.tsx` | Create | Countdown banner component |
| `src/components/subscription/TrialExpiredOverlay.tsx` | Create | Full-screen upgrade modal |
| `src/components/subscription/UpgradePrompt.tsx` | Modify | Support trial expired messaging |
| `src/components/layout/AppLayout.tsx` | Modify | Integrate trial banner and overlay |
| `supabase/functions/check-subscription/index.ts` | Modify | Include trial info in response |

---

## User Experience Flow

```text
┌─────────────────────────────────────────────────────────────┐
│                       New User Signs Up                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  DAY 1-7: Full Free Trial                                   │
│  • Paper trading with $100k virtual balance                 │
│  • AI Strategy Advisor                                      │
│  • All 8 trading strategies                                 │
│  • Trial countdown banner shown at top                      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  DAY 8+: Trial Expired                                      │
│  • Full-screen overlay blocks all features                  │
│  • Must upgrade to Pro ($49/mo) or Unlimited ($99/mo)       │
│  • No access to any features until upgrade                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Edge Cases Handled

1. **Existing users without trial_started_at**: Backfill with their `created_at` from user_roles
2. **Admin/invited users**: Always bypass trial check (has_free_access = true)
3. **Subscribed users**: Subscription status takes precedence over trial
4. **Users who subscribe during trial**: Trial becomes irrelevant, subscription tier applies

---

## Summary

This implementation creates a true "freemium with trial" model:
- New users get a taste of the platform for 7 days
- Creates urgency to upgrade before trial expires
- Completely locks out users after trial ends (forcing a decision)
- Existing paying and invited users are unaffected

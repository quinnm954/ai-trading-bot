
# Implementation Plan: Trial Email Reminders, Dashboard Indicator, Testing & Pricing Update

## Overview
This plan implements four key features:
1. **Email Reminder System** - Automated emails 3 days and 1 day before trial expiration
2. **Dashboard Trial Indicator** - "Days remaining" display in dashboard header area
3. **Trial System Testing** - Create test account to verify trial banner functionality
4. **Pricing Page Update** - Reflect the 7-day free trial in the pricing page

---

## Part 1: Email Reminder System

### New Edge Function: `send-trial-reminders`

Create a new edge function that runs daily via cron to send trial expiration reminder emails.

**Logic:**
- Query `user_roles` for users whose `trial_started_at` indicates they have exactly 3 or 1 day(s) remaining
- Exclude users who have subscriptions or free access
- Send styled email reminders with upgrade CTAs
- Track sent reminders in a new `trial_reminder_emails_sent` table to prevent duplicates

### Database Changes

**New table: `trial_reminder_emails_sent`**
```sql
CREATE TABLE public.trial_reminder_emails_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL, -- '3_day' or '1_day'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, reminder_type)
);
```

### Email Templates

**3-Day Reminder:**
- Subject: "Only 3 days left in your TitanAI trial!"
- Body: Highlights trial features used, encourages exploring before expiration, upgrade CTA

**1-Day Reminder:**
- Subject: "Last day of your TitanAI free trial"
- Body: Urgent messaging, emphasizes losing access tomorrow, prominent upgrade buttons

### Cron Schedule

Set up a daily cron job (e.g., 9 AM UTC) to invoke the edge function:
```sql
SELECT cron.schedule(
  'send-trial-reminders-daily',
  '0 9 * * *',  -- 9 AM UTC daily
  $$SELECT net.http_post(...)$$
);
```

---

## Part 2: Dashboard Trial Indicator

### Component: `TrialDaysIndicator`

Create a compact indicator component for the dashboard header/stats area showing:
- Icon (clock or hourglass)
- "X days left in trial" text
- Click to go to pricing

### Integration Points

1. **Dashboard Header Area** - Add indicator next to the "Dashboard" title
2. **Use existing `useSubscription` hook** - Already provides `trialDaysRemaining`, `isInTrial`

### Design
```text
+----------------------------------+
| Dashboard              [ 5 days remaining in trial - Upgrade ]
+----------------------------------+
```

The indicator will:
- Only show for trial users (not subscribed, not free access)
- Use color coding: green (7-4 days), orange (3-2 days), red (1 day)
- Be clickable to navigate to pricing page

---

## Part 3: Pricing Page Updates

### Changes to Free Tier Card

Update the Free tier to prominently display the 7-day trial:

**Before:**
- Name: "Free"
- Period: "forever"

**After:**
- Add badge: "7-Day Free Trial"
- Update description: "Try all free features for 7 days"
- Add note: "Full access for 7 days, then upgrade to continue"

### Add Trial Information Section

Add a callout above or below the pricing cards explaining:
- 7-day free trial for new users
- What happens when trial expires
- No credit card required to start

### Update Hero Section

Change copy to emphasize the trial:
- "Start your 7-day free trial" instead of "Start free"
- "Try before you buy" messaging

---

## Part 4: Testing

### Manual Testing Steps

After implementation, verify:

1. **New User Flow:**
   - Create new account
   - Verify `trial_started_at` is set in `user_roles`
   - Confirm trial banner appears with correct days remaining
   - Check dashboard shows trial indicator

2. **Email Reminders (can test by adjusting dates):**
   - Manually update a test user's `trial_started_at` to 4 days ago
   - Run the edge function
   - Verify 3-day reminder email is sent

3. **Trial Expiration:**
   - Set `trial_started_at` to 8 days ago
   - Verify expired overlay blocks access
   - Confirm upgrade buttons work

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `supabase/functions/send-trial-reminders/index.ts` | Create | Edge function for reminder emails |
| `supabase/config.toml` | Modify | Add function config |
| Database migration | Create | Add `trial_reminder_emails_sent` table |
| `src/components/dashboard/TrialDaysIndicator.tsx` | Create | Dashboard trial indicator |
| `src/pages/Dashboard.tsx` | Modify | Add trial indicator to header |
| `src/pages/Pricing.tsx` | Modify | Add trial messaging and badges |

---

## Technical Details

### Edge Function: `send-trial-reminders`

```typescript
// Key logic pseudocode:
1. Calculate dates for 3-day and 1-day reminders
2. Query user_roles for matching trial_started_at dates
3. Exclude users with:
   - Active subscriptions (subscriptions.status = 'active')
   - Free access (user_roles.has_free_access = true)
4. For each eligible user:
   - Check if reminder already sent (trial_reminder_emails_sent)
   - Send appropriate email via Resend
   - Record sent reminder
```

### Dashboard Indicator Props

```typescript
interface TrialDaysIndicatorProps {
  daysRemaining: number;
  className?: string;
}
```

### Pricing Page Trial Badge

Add to Free tier definition:
```typescript
{
  name: 'Free',
  badge: '7-Day Trial',
  description: 'Try all features free for 7 days',
  // ... rest of config
}
```

---

## Cron Job SQL

```sql
SELECT cron.schedule(
  'send-trial-reminders-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url:='https://obtfgoktgigulszrfzvp.supabase.co/functions/v1/send-trial-reminders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer <ANON_KEY>"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

---

## Summary

This implementation creates a complete trial experience:

1. **Awareness** - Users see trial countdown on dashboard and in banner
2. **Urgency** - Email reminders at 3 days and 1 day create action
3. **Clear Path** - Pricing page explains trial and makes upgrading easy
4. **Tested** - Manual verification ensures everything works correctly

The system works alongside the existing trial banner and expired overlay, creating a cohesive trial-to-paid conversion funnel.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRIAL_DAYS = 7;

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[TRIAL-REMINDERS] ${step}${detailsStr}`);
};

// Generate email HTML for trial reminders
function generateEmailHtml(daysRemaining: number, userName?: string): string {
  const greeting = userName ? `Hi ${userName},` : 'Hi there,';
  const urgencyColor = daysRemaining === 1 ? '#ef4444' : '#f59e0b';
  const urgencyText = daysRemaining === 1 
    ? "This is your last day!" 
    : `Only ${daysRemaining} days left!`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #0a0a0f;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 12px 24px; border-radius: 12px;">
        <span style="font-size: 24px; font-weight: bold; color: white;">Titan<span style="color: #c4b5fd;">AI</span></span>
      </div>
    </div>

    <!-- Main Card -->
    <div style="background: linear-gradient(180deg, #1a1a2e 0%, #16162a 100%); border: 1px solid #2a2a4a; border-radius: 16px; padding: 32px; color: white;">
      <!-- Urgency Badge -->
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="display: inline-block; background-color: ${urgencyColor}20; color: ${urgencyColor}; padding: 8px 16px; border-radius: 20px; font-weight: 600; font-size: 14px;">
          ⏰ ${urgencyText}
        </span>
      </div>

      <h1 style="font-size: 24px; font-weight: bold; text-align: center; margin: 0 0 16px 0; color: white;">
        Your TitanAI Trial is Ending Soon
      </h1>

      <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        ${greeting}
      </p>

      <p style="color: #a1a1aa; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
        ${daysRemaining === 1 
          ? "Your free trial ends tomorrow! After that, you'll lose access to paper trading, AI strategies, and all the features you've been exploring."
          : `Your free trial ends in ${daysRemaining} days. Make the most of your remaining time to explore all the AI trading features TitanAI has to offer.`
        }
      </p>

      <!-- Features Reminder -->
      <div style="background: #ffffff08; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <p style="color: white; font-weight: 600; margin: 0 0 12px 0; font-size: 14px;">
          What you'll lose access to:
        </p>
        <ul style="color: #a1a1aa; margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8;">
          <li>$100,000 paper trading account</li>
          <li>8 AI trading strategies</li>
          <li>AI market regime detection</li>
          <li>AI Strategy Advisor</li>
          <li>Performance analytics</li>
        </ul>
      </div>

      <!-- CTA Buttons -->
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="https://titanai-trade-automation.lovable.app/pricing" style="display: inline-block; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; margin-right: 12px;">
          Upgrade Now
        </a>
        <a href="https://titanai-trade-automation.lovable.app/dashboard" style="display: inline-block; background: transparent; color: #a78bfa; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; border: 1px solid #a78bfa;">
          Continue Trading
        </a>
      </div>

      <!-- Pricing Preview -->
      <div style="background: #ffffff05; border-radius: 12px; padding: 16px; text-align: center;">
        <p style="color: #a1a1aa; margin: 0 0 8px 0; font-size: 12px;">Starting at</p>
        <p style="color: white; margin: 0; font-size: 24px; font-weight: bold;">$49<span style="font-size: 14px; color: #a1a1aa; font-weight: normal;">/month</span></p>
        <p style="color: #a1a1aa; margin: 8px 0 0 0; font-size: 12px;">Live trading with real money</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; margin-top: 24px; color: #71717a; font-size: 12px;">
      <p style="margin: 0;">© 2026 TitanAI. All rights reserved.</p>
      <p style="margin: 8px 0 0 0;">
        <a href="https://titanai-trade-automation.lovable.app" style="color: #a78bfa; text-decoration: none;">Visit TitanAI</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Starting trial reminder check");

    const now = new Date();
    
    // Calculate the trial start dates that correspond to 3 days and 1 day remaining
    // If trial is 7 days, 3 days remaining means trial started 4 days ago
    // 1 day remaining means trial started 6 days ago
    const threeDaysRemainingDate = new Date(now);
    threeDaysRemainingDate.setDate(now.getDate() - (TRIAL_DAYS - 3));
    threeDaysRemainingDate.setHours(0, 0, 0, 0);

    const oneDayRemainingDate = new Date(now);
    oneDayRemainingDate.setDate(now.getDate() - (TRIAL_DAYS - 1));
    oneDayRemainingDate.setHours(0, 0, 0, 0);

    const threeDaysEnd = new Date(threeDaysRemainingDate);
    threeDaysEnd.setHours(23, 59, 59, 999);

    const oneDayEnd = new Date(oneDayRemainingDate);
    oneDayEnd.setHours(23, 59, 59, 999);

    logStep("Calculated reminder dates", {
      threeDaysRange: `${threeDaysRemainingDate.toISOString()} to ${threeDaysEnd.toISOString()}`,
      oneDayRange: `${oneDayRemainingDate.toISOString()} to ${oneDayEnd.toISOString()}`,
    });

    // Get users who need 3-day reminder
    const { data: threeDayUsers, error: threeDayError } = await supabase
      .from('user_roles')
      .select('user_id, trial_started_at, has_free_access')
      .gte('trial_started_at', threeDaysRemainingDate.toISOString())
      .lte('trial_started_at', threeDaysEnd.toISOString())
      .eq('has_free_access', false);

    if (threeDayError) {
      logStep("Error fetching 3-day users", { error: threeDayError.message });
    }

    // Get users who need 1-day reminder
    const { data: oneDayUsers, error: oneDayError } = await supabase
      .from('user_roles')
      .select('user_id, trial_started_at, has_free_access')
      .gte('trial_started_at', oneDayRemainingDate.toISOString())
      .lte('trial_started_at', oneDayEnd.toISOString())
      .eq('has_free_access', false);

    if (oneDayError) {
      logStep("Error fetching 1-day users", { error: oneDayError.message });
    }

    logStep("Found users needing reminders", {
      threeDayCount: threeDayUsers?.length || 0,
      oneDayCount: oneDayUsers?.length || 0,
    });

    const emailsSent: { userId: string; type: string }[] = [];
    const errors: { userId: string; error: string }[] = [];

    // Process 3-day reminders
    for (const user of threeDayUsers || []) {
      try {
        // Check if already sent
        const { data: existing } = await supabase
          .from('trial_reminder_emails_sent')
          .select('id')
          .eq('user_id', user.user_id)
          .eq('reminder_type', '3_day')
          .maybeSingle();

        if (existing) {
          logStep("3-day reminder already sent", { userId: user.user_id });
          continue;
        }

        // Check if user has active subscription
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', user.user_id)
          .eq('status', 'active')
          .maybeSingle();

        if (subscription) {
          logStep("User has active subscription, skipping", { userId: user.user_id });
          continue;
        }

        // Get user email from auth
        const { data: authUser } = await supabase.auth.admin.getUserById(user.user_id);
        
        if (!authUser?.user?.email) {
          logStep("No email found for user", { userId: user.user_id });
          continue;
        }

        // Send email
        const emailResult = await resend.emails.send({
          from: "TitanAI <noreply@capitalservicesmanagement.com>",
          to: [authUser.user.email],
          subject: "⏰ Only 3 days left in your TitanAI trial!",
          html: generateEmailHtml(3),
        });

        logStep("Sent 3-day reminder", { userId: user.user_id, email: authUser.user.email, result: emailResult });

        // Record sent
        await supabase
          .from('trial_reminder_emails_sent')
          .insert({ user_id: user.user_id, reminder_type: '3_day' });

        emailsSent.push({ userId: user.user_id, type: '3_day' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep("Error sending 3-day reminder", { userId: user.user_id, error: errorMessage });
        errors.push({ userId: user.user_id, error: errorMessage });
      }
    }

    // Process 1-day reminders
    for (const user of oneDayUsers || []) {
      try {
        // Check if already sent
        const { data: existing } = await supabase
          .from('trial_reminder_emails_sent')
          .select('id')
          .eq('user_id', user.user_id)
          .eq('reminder_type', '1_day')
          .maybeSingle();

        if (existing) {
          logStep("1-day reminder already sent", { userId: user.user_id });
          continue;
        }

        // Check if user has active subscription
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', user.user_id)
          .eq('status', 'active')
          .maybeSingle();

        if (subscription) {
          logStep("User has active subscription, skipping", { userId: user.user_id });
          continue;
        }

        // Get user email from auth
        const { data: authUser } = await supabase.auth.admin.getUserById(user.user_id);
        
        if (!authUser?.user?.email) {
          logStep("No email found for user", { userId: user.user_id });
          continue;
        }

        // Send email
        const emailResult = await resend.emails.send({
          from: "TitanAI <noreply@capitalservicesmanagement.com>",
          to: [authUser.user.email],
          subject: "⚠️ Last day of your TitanAI free trial!",
          html: generateEmailHtml(1),
        });

        logStep("Sent 1-day reminder", { userId: user.user_id, email: authUser.user.email, result: emailResult });

        // Record sent
        await supabase
          .from('trial_reminder_emails_sent')
          .insert({ user_id: user.user_id, reminder_type: '1_day' });

        emailsSent.push({ userId: user.user_id, type: '1_day' });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep("Error sending 1-day reminder", { userId: user.user_id, error: errorMessage });
        errors.push({ userId: user.user_id, error: errorMessage });
      }
    }

    logStep("Completed trial reminders", {
      emailsSent: emailsSent.length,
      errors: errors.length,
    });

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent,
        errors,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in send-trial-reminders", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  userId?: string;
  forceResend?: boolean;
}

const sendEmail = async (to: string, subject: string, html: string) => {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Titan Trading <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return response.json();
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let body: WelcomeEmailRequest = {};
    try {
      body = await req.json();
    } catch {
      // Allow empty body for cron calls
    }
    
    const { userId, forceResend } = body;

    console.log("Starting welcome email process", { userId, forceResend, time: new Date().toISOString() });

    // Get users who signed up more than 24 hours ago
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get all users from auth who signed up 24+ hours ago
    const { data: authUsers, error: authListError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    if (authListError) {
      console.error("Error fetching auth users:", authListError);
      throw authListError;
    }

    // Filter to users who signed up 24+ hours ago
    const eligibleUsers = authUsers.users.filter(u => {
      const createdAt = new Date(u.created_at);
      return createdAt < new Date(twentyFourHoursAgo);
    });

    console.log(`Found ${eligibleUsers.length} users who signed up 24+ hours ago`);

    // Get users who already received welcome email
    const { data: alreadySent, error: sentError } = await supabase
      .from("welcome_emails_sent")
      .select("user_id");

    if (sentError) {
      console.error("Error fetching sent emails:", sentError);
      throw sentError;
    }

    const alreadySentSet = new Set(alreadySent?.map(s => s.user_id) || []);

    // Get users who have trades
    const { data: usersWithTrades, error: tradesError } = await supabase
      .from("trades")
      .select("user_id")
      .not("user_id", "is", null);

    if (tradesError) {
      console.error("Error fetching trades:", tradesError);
      throw tradesError;
    }

    const usersWithTradesSet = new Set(usersWithTrades?.map(t => t.user_id) || []);

    // Filter to users who:
    // 1. Haven't received the email yet (unless forceResend)
    // 2. Haven't traded yet
    // 3. Match userId if provided
    const usersToEmail = eligibleUsers.filter(u => {
      if (userId && u.id !== userId) return false;
      if (!forceResend && alreadySentSet.has(u.id)) return false;
      if (usersWithTradesSet.has(u.id)) return false;
      return true;
    });

    console.log(`Found ${usersToEmail.length} users eligible for welcome email`);

    const emailsSent: string[] = [];
    const errors: string[] = [];

    for (const user of usersToEmail) {
      if (!user.email) {
        console.log(`User ${user.id} has no email, skipping`);
        continue;
      }

      const email = user.email;
      console.log(`Sending welcome email to ${email}`);

      try {
        const welcomeHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #0f0f23;">
              <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #2a2a4a;">
                  
                  <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 16px 0; text-align: center;">
                    🚀 Welcome to TitanAI!
                  </h1>
                  
                  <!-- 7-Day Trial Countdown Banner -->
                  <div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 12px; padding: 20px; margin: 0 0 24px 0; text-align: center;">
                    <div style="font-size: 32px; font-weight: bold; color: #ffffff; margin: 0 0 8px 0;">
                      ⏱️ 7 Days Free Trial
                    </div>
                    <p style="color: #fef3c7; font-size: 14px; margin: 0;">
                      Your countdown has started! Explore all premium features before it ends.
                    </p>
                  </div>
                  
                  <p style="color: #a0a0b8; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                    We noticed you haven't explored the platform yet. Your AI-powered trading assistant is ready and waiting to help you maximize your trial!
                  </p>
                  
                  <!-- Features to Explore -->
                  <div style="background: rgba(99, 102, 241, 0.1); border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid rgba(99, 102, 241, 0.2);">
                    <h2 style="color: #818cf8; font-size: 18px; margin: 0 0 16px 0;">
                      🎯 Explore These Features During Your Trial:
                    </h2>
                    <ul style="color: #a0a0b8; font-size: 14px; line-height: 2.2; margin: 0; padding-left: 20px;">
                      <li><strong style="color: #ffffff;">Paper Trading</strong> – Practice with $100,000 virtual funds, risk-free</li>
                      <li><strong style="color: #ffffff;">AI Trading Engine</strong> – Let AI analyze markets and execute trades automatically</li>
                      <li><strong style="color: #ffffff;">Risk Management</strong> – Set stop-losses, daily limits, and drawdown protection</li>
                      <li><strong style="color: #ffffff;">Market Analysis</strong> – Real-time regime detection and strategy recommendations</li>
                      <li><strong style="color: #ffffff;">Copy Trading</strong> – Follow successful traders and mirror their strategies</li>
                    </ul>
                  </div>
                  
                  <!-- Day-by-Day Guide -->
                  <div style="background: rgba(34, 197, 94, 0.1); border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid rgba(34, 197, 94, 0.2);">
                    <h2 style="color: #22c55e; font-size: 18px; margin: 0 0 16px 0;">
                      📅 Your 7-Day Trial Roadmap:
                    </h2>
                    <div style="color: #a0a0b8; font-size: 14px; line-height: 1.8;">
                      <p style="margin: 0 0 8px 0;"><strong style="color: #ffffff;">Day 1-2:</strong> Connect your paper account and place your first AI-assisted trade</p>
                      <p style="margin: 0 0 8px 0;"><strong style="color: #ffffff;">Day 3-4:</strong> Explore risk settings and customize your trading parameters</p>
                      <p style="margin: 0 0 8px 0;"><strong style="color: #ffffff;">Day 5-6:</strong> Enable autonomous trading and watch the AI work</p>
                      <p style="margin: 0;"><strong style="color: #ffffff;">Day 7:</strong> Review your results and decide on your subscription</p>
                    </div>
                  </div>
                  
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://titanai-trade-automation.lovable.app/dashboard" 
                       style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; font-weight: 600; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
                      🎮 Start Your Trial Now
                    </a>
                  </div>
                  
                  <div style="background: rgba(239, 68, 68, 0.1); border-radius: 8px; padding: 16px; margin: 24px 0; border: 1px solid rgba(239, 68, 68, 0.2); text-align: center;">
                    <p style="color: #fca5a5; font-size: 14px; margin: 0;">
                      ⚡ <strong>Don't let your trial expire unused!</strong><br/>
                      <span style="color: #a0a0b8;">You only have 7 days to experience the full power of TitanAI.</span>
                    </p>
                  </div>
                  
                  <p style="color: #6b6b80; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0; text-align: center;">
                    Questions? Contact us at capitalservicesmanagementinc@outlook.com
                  </p>
                  
                </div>
                
                <p style="color: #4a4a5a; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
                  © 2025 TitanAI Trading. All rights reserved.
                </p>
              </div>
            </body>
          </html>
        `;

        await sendEmail(email, "🚀 Your 7-Day TitanAI Trial Has Started!", welcomeHtml);
        console.log(`Email sent to ${email}`);

        // Record that we sent the email
        const { error: insertError } = await supabase
          .from("welcome_emails_sent")
          .upsert({ user_id: user.id, sent_at: new Date().toISOString() });

        if (insertError) {
          console.error(`Failed to record email sent for ${user.id}:`, insertError);
        }

        emailsSent.push(email);
      } catch (emailError: any) {
        console.error(`Failed to send email to ${email}:`, emailError);
        errors.push(`${email}: ${emailError.message}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        emailsSent: emailsSent.length,
        recipients: emailsSent,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-welcome-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

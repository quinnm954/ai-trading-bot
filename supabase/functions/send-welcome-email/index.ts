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
  sendToAll?: boolean;
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
    const { userId, sendToAll }: WelcomeEmailRequest = await req.json();

    console.log("Starting welcome email process", { userId, sendToAll });

    // Find users who haven't started trading (no trades in the trades table)
    let query = supabase
      .from("user_roles")
      .select("user_id");

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data: allUsers, error: usersError } = await query;

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw usersError;
    }

    console.log(`Found ${allUsers?.length || 0} users to check`);

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
    
    // Filter to users who haven't traded
    const usersToEmail = allUsers?.filter(u => !usersWithTradesSet.has(u.user_id)) || [];
    
    console.log(`Found ${usersToEmail.length} users who haven't started trading`);

    const emailsSent: string[] = [];
    const errors: string[] = [];

    for (const user of usersToEmail) {
      // Get user email from auth
      const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(user.user_id);
      
      if (authError || !authUser?.user?.email) {
        console.error(`Could not get email for user ${user.user_id}:`, authError);
        errors.push(`User ${user.user_id}: No email found`);
        continue;
      }

      const email = authUser.user.email;
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
                  
                  <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 20px 0; text-align: center;">
                    Welcome to Titan Trading!
                  </h1>
                  
                  <p style="color: #a0a0b8; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                    We noticed you haven't placed your first trade yet. Your AI-powered trading assistant is ready and waiting to help you get started!
                  </p>
                  
                  <div style="background: rgba(99, 102, 241, 0.1); border-radius: 12px; padding: 24px; margin: 24px 0; border: 1px solid rgba(99, 102, 241, 0.2);">
                    <h2 style="color: #818cf8; font-size: 18px; margin: 0 0 16px 0;">
                      Here's what you can do:
                    </h2>
                    <ul style="color: #a0a0b8; font-size: 14px; line-height: 2; margin: 0; padding-left: 20px;">
                      <li>Practice with $100,000 in paper trading funds</li>
                      <li>Get AI-powered market analysis and trade suggestions</li>
                      <li>Learn strategies with real-time market data</li>
                      <li>Connect your broker when you're ready for live trading</li>
                    </ul>
                  </div>
                  
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="https://obtfgoktgigulszrfzvp.lovableproject.com/dashboard" 
                       style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      Start Trading Now
                    </a>
                  </div>
                  
                  <p style="color: #6b6b80; font-size: 14px; line-height: 1.6; margin: 24px 0 0 0; text-align: center;">
                    Questions? Just reply to this email - we're here to help!
                  </p>
                  
                </div>
                
                <p style="color: #4a4a5a; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
                  2024 Titan Trading. All rights reserved.
                </p>
              </div>
            </body>
          </html>
        `;

        await sendEmail(email, "Ready to Start Your Trading Journey?", welcomeHtml);
        console.log(`Email sent to ${email}`);
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

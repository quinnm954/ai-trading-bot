import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    signDisplay: 'always',
  }).format(value);
};

const formatPercent = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'always',
  }).format(value / 100);
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting weekly summary email process");

    // Get date range for the past week
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const weekStart = oneWeekAgo.toISOString();

    // Get all active users (those with trades or positions)
    const { data: activeUsers, error: usersError } = await supabase
      .from("user_roles")
      .select("user_id");

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw usersError;
    }

    console.log(`Processing ${activeUsers?.length || 0} users`);

    const emailsSent: string[] = [];
    const errors: string[] = [];

    for (const userRecord of activeUsers || []) {
      const userId = userRecord.user_id;

      try {
        // Get user email
        const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

        if (authError || !authUser?.user?.email) {
          console.log(`Skipping user ${userId}: no email`);
          continue;
        }

        const email = authUser.user.email;

        // Get weekly trades
        const { data: trades, error: tradesError } = await supabase
          .from("trades")
          .select("*")
          .eq("user_id", userId)
          .gte("created_at", weekStart);

        if (tradesError) {
          console.error(`Error fetching trades for ${userId}:`, tradesError);
          continue;
        }

        // Get current positions
        const { data: positions, error: positionsError } = await supabase
          .from("positions")
          .select("*")
          .eq("user_id", userId);

        if (positionsError) {
          console.error(`Error fetching positions for ${userId}:`, positionsError);
          continue;
        }

        // Get paper account balance
        const { data: paperAccount } = await supabase
          .from("paper_account")
          .select("balance, initial_balance")
          .eq("user_id", userId)
          .single();

        // Skip users with no activity
        if ((!trades || trades.length === 0) && (!positions || positions.length === 0)) {
          console.log(`Skipping user ${userId}: no activity this week`);
          continue;
        }

        // Calculate stats
        const closedTrades = trades?.filter(t => t.status === 'closed') || [];
        const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
        const winningTrades = closedTrades.filter(t => (t.pnl || 0) > 0);
        const losingTrades = closedTrades.filter(t => (t.pnl || 0) < 0);
        const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;

        const totalUnrealizedPnL = positions?.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0) || 0;
        const portfolioValue = paperAccount?.balance || 100000;
        const initialBalance = paperAccount?.initial_balance || 100000;
        const totalReturn = ((portfolioValue - initialBalance) / initialBalance) * 100;

        // Best and worst trades
        const bestTrade = closedTrades.length > 0 
          ? closedTrades.reduce((best, t) => (t.pnl || 0) > (best.pnl || 0) ? t : best)
          : null;
        const worstTrade = closedTrades.length > 0
          ? closedTrades.reduce((worst, t) => (t.pnl || 0) < (worst.pnl || 0) ? t : worst)
          : null;

        const summaryHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #0f0f23;">
              <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
                <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #2a2a4a;">
                  
                  <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; text-align: center;">
                    Weekly Performance Report
                  </h1>
                  
                  <p style="color: #6b6b80; font-size: 14px; margin: 0 0 32px 0; text-align: center;">
                    ${oneWeekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  
                  <!-- Portfolio Summary -->
                  <div style="background: linear-gradient(135deg, ${totalPnL >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'} 0%, rgba(0,0,0,0) 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px; text-align: center;">
                    <p style="color: #6b6b80; font-size: 14px; margin: 0 0 8px 0;">Weekly P&L</p>
                    <p style="color: ${totalPnL >= 0 ? '#22c55e' : '#ef4444'}; font-size: 36px; font-weight: 700; margin: 0;">
                      ${formatCurrency(totalPnL)}
                    </p>
                  </div>
                  
                  <!-- Stats Grid -->
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
                    <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; text-align: center;">
                      <p style="color: #6b6b80; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Total Trades</p>
                      <p style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0;">${trades?.length || 0}</p>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; text-align: center;">
                      <p style="color: #6b6b80; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Win Rate</p>
                      <p style="color: ${winRate >= 50 ? '#22c55e' : '#ef4444'}; font-size: 24px; font-weight: 600; margin: 0;">${winRate.toFixed(1)}%</p>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; text-align: center;">
                      <p style="color: #6b6b80; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Portfolio Value</p>
                      <p style="color: #ffffff; font-size: 24px; font-weight: 600; margin: 0;">${formatCurrency(portfolioValue).replace('+', '')}</p>
                    </div>
                    <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; text-align: center;">
                      <p style="color: #6b6b80; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Total Return</p>
                      <p style="color: ${totalReturn >= 0 ? '#22c55e' : '#ef4444'}; font-size: 24px; font-weight: 600; margin: 0;">${formatPercent(totalReturn)}</p>
                    </div>
                  </div>
                  
                  <!-- Trade Breakdown -->
                  <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">Trade Breakdown</h3>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                      <span style="color: #6b6b80;">Winning Trades</span>
                      <span style="color: #22c55e; font-weight: 600;">${winningTrades.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                      <span style="color: #6b6b80;">Losing Trades</span>
                      <span style="color: #ef4444; font-weight: 600;">${losingTrades.length}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: #6b6b80;">Open Positions</span>
                      <span style="color: #818cf8; font-weight: 600;">${positions?.length || 0}</span>
                    </div>
                  </div>
                  
                  ${bestTrade || worstTrade ? `
                  <!-- Best/Worst Trades -->
                  <div style="background: rgba(99, 102, 241, 0.1); border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid rgba(99, 102, 241, 0.2);">
                    <h3 style="color: #818cf8; font-size: 14px; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 0.5px;">Highlights</h3>
                    ${bestTrade ? `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
                      <span style="color: #a0a0b8;">Best Trade: ${bestTrade.symbol}</span>
                      <span style="color: #22c55e; font-weight: 600;">${formatCurrency(bestTrade.pnl || 0)}</span>
                    </div>
                    ` : ''}
                    ${worstTrade && (worstTrade.pnl || 0) < 0 ? `
                    <div style="display: flex; justify-content: space-between;">
                      <span style="color: #a0a0b8;">Worst Trade: ${worstTrade.symbol}</span>
                      <span style="color: #ef4444; font-weight: 600;">${formatCurrency(worstTrade.pnl || 0)}</span>
                    </div>
                    ` : ''}
                  </div>
                  ` : ''}
                  
                  ${totalUnrealizedPnL !== 0 ? `
                  <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin-bottom: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="color: #6b6b80;">Unrealized P&L</span>
                      <span style="color: ${totalUnrealizedPnL >= 0 ? '#22c55e' : '#ef4444'}; font-size: 18px; font-weight: 600;">${formatCurrency(totalUnrealizedPnL)}</span>
                    </div>
                  </div>
                  ` : ''}
                  
                  <div style="text-align: center; margin: 32px 0 0 0;">
                    <a href="https://obtfgoktgigulszrfzvp.lovableproject.com/dashboard" 
                       style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                      View Full Dashboard
                    </a>
                  </div>
                  
                </div>
                
                <p style="color: #4a4a5a; font-size: 12px; text-align: center; margin: 24px 0 0 0;">
                  2024 Titan Trading. All rights reserved.
                </p>
              </div>
            </body>
          </html>
        `;

        await sendEmail(
          email,
          `Your Weekly Trading Report: ${formatCurrency(totalPnL)} P&L`,
          summaryHtml
        );

        console.log(`Weekly summary sent to ${email}`);
        emailsSent.push(email);
      } catch (userError: any) {
        console.error(`Error processing user ${userId}:`, userError);
        errors.push(`${userId}: ${userError.message}`);
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
    console.error("Error in send-weekly-summary:", error);
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

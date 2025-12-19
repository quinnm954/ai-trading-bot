import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.86.2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TradeConfirmationRequest {
  userId: string;
  tradeId: string;
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

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { userId, tradeId }: TradeConfirmationRequest = await req.json();

    console.log("Sending trade confirmation", { userId, tradeId });

    // Get trade details
    const { data: trade, error: tradeError } = await supabase
      .from("trades")
      .select("*")
      .eq("id", tradeId)
      .single();

    if (tradeError || !trade) {
      console.error("Trade not found:", tradeError);
      throw new Error("Trade not found");
    }

    // Get user email
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

    if (authError || !authUser?.user?.email) {
      console.error("User not found:", authError);
      throw new Error("User not found");
    }

    const email = authUser.user.email;
    const tradeValue = trade.entry_price * trade.quantity;
    const isPaper = trade.is_paper;
    const isBuy = trade.side === 'buy';

    const tradeHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #0f0f23;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 16px; padding: 40px; border: 1px solid #2a2a4a;">
              
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="display: inline-block; background: ${isBuy ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${isBuy ? '#22c55e' : '#ef4444'}; padding: 8px 16px; border-radius: 20px; font-size: 14px; font-weight: 600;">
                  ${isBuy ? 'BUY' : 'SELL'} ORDER ${isPaper ? '(PAPER)' : 'EXECUTED'}
                </span>
              </div>
              
              <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0; text-align: center;">
                Trade Confirmation
              </h1>
              
              <p style="color: #6b6b80; font-size: 14px; margin: 0 0 32px 0; text-align: center;">
                ${new Date(trade.created_at).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
              </p>
              
              <div style="background: rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 24px; margin: 24px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px;">
                  <span style="color: #6b6b80; font-size: 14px;">Symbol</span>
                  <span style="color: #ffffff; font-size: 16px; font-weight: 600;">${trade.symbol}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px;">
                  <span style="color: #6b6b80; font-size: 14px;">Quantity</span>
                  <span style="color: #ffffff; font-size: 16px;">${trade.quantity}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px;">
                  <span style="color: #6b6b80; font-size: 14px;">Price</span>
                  <span style="color: #ffffff; font-size: 16px;">${formatCurrency(trade.entry_price)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 16px;">
                  <span style="color: #6b6b80; font-size: 14px;">Total Value</span>
                  <span style="color: #818cf8; font-size: 18px; font-weight: 600;">${formatCurrency(tradeValue)}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #6b6b80; font-size: 14px;">Strategy</span>
                  <span style="color: #ffffff; font-size: 16px; text-transform: capitalize;">${trade.strategy || 'Manual'}</span>
                </div>
              </div>
              
              ${trade.ai_reasoning ? `
              <div style="background: rgba(99, 102, 241, 0.1); border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid rgba(99, 102, 241, 0.2);">
                <h3 style="color: #818cf8; font-size: 14px; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.5px;">AI Analysis</h3>
                <p style="color: #a0a0b8; font-size: 14px; line-height: 1.6; margin: 0;">${trade.ai_reasoning}</p>
              </div>
              ` : ''}
              
              <div style="text-align: center; margin: 32px 0;">
                <a href="https://obtfgoktgigulszrfzvp.lovableproject.com/trades" 
                   style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  View All Trades
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
      `Trade Confirmed: ${isBuy ? 'Bought' : 'Sold'} ${trade.quantity} ${trade.symbol}`,
      tradeHtml
    );

    console.log(`Trade confirmation sent to ${email}`);

    return new Response(
      JSON.stringify({ success: true, email }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-trade-confirmation:", error);
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

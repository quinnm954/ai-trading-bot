// Verifies a Stripe Checkout session for an AI credit purchase and credits the user.
// Idempotent: uses stripe_session_id unique constraint on ai_credit_transactions.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { session_id } = await req.json();
    if (!session_id) throw new Error("session_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ status: session.payment_status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = session.metadata?.user_id;
    const credits = Number(session.metadata?.credits || 0);
    if (!userId || !credits) throw new Error("Missing metadata on session");

    // Idempotent insert. Conflict on stripe_session_id = already credited.
    const { error: insErr } = await supabase
      .from("ai_credit_transactions")
      .insert({
        user_id: userId,
        delta: credits,
        type: "purchase",
        description: session.metadata?.pack || "credit pack",
        stripe_session_id: session_id,
      });
    if (insErr && !String(insErr.message).includes("duplicate")) throw insErr;
    if (insErr) {
      // Duplicate - already credited
      return new Response(JSON.stringify({ status: "already_credited" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert balance
    const { data: existing } = await supabase
      .from("ai_credit_balances").select("credits").eq("user_id", userId).maybeSingle();
    const newBalance = Number(existing?.credits || 0) + credits;
    await supabase.from("ai_credit_balances").upsert({
      user_id: userId,
      credits: newBalance,
      updated_at: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ status: "credited", credits, balance: newBalance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

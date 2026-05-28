// Buy AI credits via Stripe Checkout.
// Packs are self-contained (price_data) so no Stripe product setup is required.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const CREDIT_PACKS: Record<string, { credits: number; amount_cents: number; name: string }> = {
  starter:   { credits: 500,   amount_cents: 500,   name: "Starter — 500 AI credits" },
  popular:   { credits: 2500,  amount_cents: 2000,  name: "Popular — 2,500 AI credits" },
  pro:       { credits: 10000, amount_cents: 7000,  name: "Pro — 10,000 AI credits" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const auth = req.headers.get("Authorization")!;
    const { data: u } = await supabase.auth.getUser(auth.replace("Bearer ", ""));
    const user = u.user;
    if (!user?.email) throw new Error("Not authenticated");

    const { pack } = await req.json();
    const selected = CREDIT_PACKS[pack];
    if (!selected) throw new Error("Unknown pack");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: { name: selected.name },
          unit_amount: selected.amount_cents,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/?credits_purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.get("origin")}/?credits_purchase=cancelled`,
      metadata: {
        user_id: user.id,
        pack,
        credits: String(selected.credits),
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

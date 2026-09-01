import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MONTHLY_PRICE_USD = 29;
const PRICE_LOOKUP_KEY = "titanai_full_access_monthly_v1";

const logStep = (step: string, details?: unknown) => {
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

/** Find (or create once) the single recurring price so purchases stay trackable in Stripe. */
async function resolvePriceId(stripe: Stripe): Promise<string> {
  const existing = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (existing.data.length > 0) {
    logStep("Using existing price", { priceId: existing.data[0].id });
    return existing.data[0].id;
  }

  const product = await stripe.products.create({
    name: "TitanAI Full Access",
    description: "Unlimited AI trading — live trading, all agents, all brokers.",
  });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: MONTHLY_PRICE_USD * 100,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: PRICE_LOOKUP_KEY,
  });
  logStep("Created price", { priceId: price.id, productId: product.id });
  return price.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data.length > 0 ? customers.data[0].id : undefined;

    // Don't let an already-active subscriber double-pay
    if (customerId) {
      const active = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
      if (active.data.length > 0) {
        logStep("Already subscribed");
        return new Response(
          JSON.stringify({ error: "You already have an active subscription", already_subscribed: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 },
        );
      }
    }

    const priceId = await resolvePriceId(stripe);
    const origin = req.headers.get("origin") || "https://titanai-trade-automation.lovable.app";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      // Wallets (Apple Pay / Google Pay) render automatically on supported devices
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      success_url: `${origin}/settings?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      metadata: { user_id: user.id },
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

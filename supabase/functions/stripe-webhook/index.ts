import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Product IDs mapped to tier names
const PRODUCT_TIERS: Record<string, string> = {
  "prod_TbanxuUyp9ELt6": "pro",
  "prod_Tban7C5npo2nlN": "unlimited",
};

serve(async (req) => {
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
    apiVersion: "2025-08-27.basil",
  });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      logStep("ERROR: No signature provided");
      return new Response("No signature", { status: 400 });
    }

    const body = await req.text();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    
    let event: Stripe.Event;
    
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        logStep("ERROR: Webhook signature verification failed", { error: err instanceof Error ? err.message : err });
        return new Response(`Webhook signature verification failed`, { status: 400 });
      }
    } else {
      // For development without webhook secret
      event = JSON.parse(body);
      logStep("WARNING: No webhook secret configured, skipping signature verification");
    }

    logStep("Event received", { type: event.type, id: event.id });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(supabaseClient, stripe, session);
        break;
      }
      
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionChange(supabaseClient, stripe, subscription);
        break;
      }
      
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCanceled(supabaseClient, subscription);
        break;
      }
      
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(supabaseClient, invoice);
        break;
      }
      
      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR processing webhook", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function handleCheckoutCompleted(
  supabase: any,
  stripe: Stripe,
  session: Stripe.Checkout.Session
) {
  logStep("Processing checkout.session.completed", { sessionId: session.id });

  if (session.mode !== "subscription") {
    logStep("Not a subscription checkout, skipping");
    return;
  }

  const customerEmail = session.customer_email || session.customer_details?.email;
  if (!customerEmail) {
    logStep("ERROR: No customer email found");
    return;
  }

  // Find user by email
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    logStep("ERROR: Failed to list users", { error: userError.message });
    return;
  }

  const user = userData.users.find((u: any) => u.email === customerEmail);
  if (!user) {
    logStep("ERROR: User not found for email", { email: customerEmail });
    return;
  }

  // Get subscription details
  const subscriptionId = session.subscription as string;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  await upsertSubscription(supabase, user.id, session.customer as string, subscription);
  logStep("Subscription created for user", { userId: user.id, tier: getSubscriptionTier(subscription) });
}

async function handleSubscriptionChange(
  supabase: any,
  stripe: Stripe,
  subscription: Stripe.Subscription
) {
  logStep("Processing subscription change", { subscriptionId: subscription.id, status: subscription.status });

  const customerId = subscription.customer as string;
  
  // Get customer email
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    logStep("ERROR: Customer was deleted");
    return;
  }

  const customerEmail = customer.email;
  if (!customerEmail) {
    logStep("ERROR: No customer email found");
    return;
  }

  // Find user by email
  const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
  if (userError) {
    logStep("ERROR: Failed to list users", { error: userError.message });
    return;
  }

  const user = userData.users.find((u: any) => u.email === customerEmail);
  if (!user) {
    logStep("ERROR: User not found for email", { email: customerEmail });
    return;
  }

  await upsertSubscription(supabase, user.id, customerId, subscription);
  logStep("Subscription updated for user", { userId: user.id, status: subscription.status });
}

async function handleSubscriptionCanceled(supabase: any, subscription: Stripe.Subscription) {
  logStep("Processing subscription canceled", { subscriptionId: subscription.id });

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "canceled",
      tier: "free",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) {
    logStep("ERROR: Failed to update subscription", { error: error.message });
  } else {
    logStep("Subscription marked as canceled");
  }
}

async function handlePaymentFailed(supabase: any, invoice: Stripe.Invoice) {
  logStep("Processing payment failed", { invoiceId: invoice.id });

  if (!invoice.subscription) {
    logStep("No subscription on invoice, skipping");
    return;
  }

  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "past_due",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", invoice.subscription);

  if (error) {
    logStep("ERROR: Failed to update subscription status", { error: error.message });
  } else {
    logStep("Subscription marked as past_due");
  }
}

function getSubscriptionTier(subscription: Stripe.Subscription): string {
  const productId = subscription.items.data[0]?.price?.product as string;
  return PRODUCT_TIERS[productId] || "pro";
}

async function upsertSubscription(
  supabase: any,
  userId: string,
  customerId: string,
  subscription: Stripe.Subscription
) {
  const tier = getSubscriptionTier(subscription);
  const status = subscription.status === "active" || subscription.status === "trialing" ? "active" : subscription.status;

  const subscriptionData = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    tier,
    status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("subscriptions")
    .upsert(subscriptionData, { onConflict: "user_id" });

  if (error) {
    logStep("ERROR: Failed to upsert subscription", { error: error.message });
    throw error;
  }
}

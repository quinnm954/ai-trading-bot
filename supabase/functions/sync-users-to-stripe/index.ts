import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-USERS-TO-STRIPE] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    // Verify admin access
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabaseClient.auth.getUser(token);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    // Check if user is admin
    const { data: adminCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (!adminCheck) {
      throw new Error("Admin access required");
    }
    logStep("Admin verified", { email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Get all users from auth.users via admin API
    const { data: authData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }

    const users = authData.users;
    logStep("Found users", { count: users.length });

    let created = 0;
    let existing = 0;
    let failed = 0;
    const results: any[] = [];

    for (const authUser of users) {
      if (!authUser.email) {
        logStep("Skipping user without email", { id: authUser.id });
        continue;
      }

      try {
        // Check if customer already exists in Stripe
        const customers = await stripe.customers.list({ email: authUser.email, limit: 1 });
        
        if (customers.data.length > 0) {
          existing++;
          results.push({ email: authUser.email, status: 'exists', customerId: customers.data[0].id });
          logStep("Customer already exists", { email: authUser.email, customerId: customers.data[0].id });
        } else {
          // Create new customer
          const customer = await stripe.customers.create({
            email: authUser.email,
            metadata: {
              supabase_user_id: authUser.id,
              signup_date: authUser.created_at || new Date().toISOString(),
              synced_at: new Date().toISOString(),
            },
          });
          created++;
          results.push({ email: authUser.email, status: 'created', customerId: customer.id });
          logStep("Customer created", { email: authUser.email, customerId: customer.id });
        }
      } catch (userError) {
        failed++;
        const errorMsg = userError instanceof Error ? userError.message : String(userError);
        results.push({ email: authUser.email, status: 'failed', error: errorMsg });
        logStep("Failed to process user", { email: authUser.email, error: errorMsg });
      }
    }

    logStep("Sync complete", { created, existing, failed, total: users.length });

    return new Response(JSON.stringify({ 
      success: true,
      created,
      existing,
      failed,
      total: users.length,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

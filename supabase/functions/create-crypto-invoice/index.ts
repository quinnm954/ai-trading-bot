import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  CHAINS,
  isValidEvmAddress,
  toBaseUnits,
  buildPaymentUri,
} from "../_shared/crypto-chain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const INVOICE_TTL_MINUTES = 60;
const MAX_AMOUNT_ATTEMPTS = 12;

const logStep = (step: string, details?: unknown) => {
  console.log(`[CREATE-CRYPTO-INVOICE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

/**
 * Adds a unique sub-cent offset so each pending invoice has an amount no other
 * pending invoice shares. That amount is how we attribute an on-chain transfer
 * to a user without needing any payment processor.
 */
function buildUniqueAmount(basePrice: number): string {
  const offsetMicros = 1 + Math.floor(Math.random() * 9899); // 0.000001 - 0.009900
  const micros = BigInt(Math.round(basePrice * 1_000_000)) + BigInt(offsetMicros);
  const s = micros.toString().padStart(7, "0");
  return `${s.slice(0, s.length - 6)}.${s.slice(s.length - 6)}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Free up amounts held by abandoned invoices before allocating a new one
    await supabase.rpc("expire_stale_crypto_invoices");

    const { data: config, error: configError } = await supabase
      .from("crypto_payment_config")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (configError) throw new Error(`Could not load payment config: ${configError.message}`);
    if (!config?.enabled || !config.wallet_address) {
      return new Response(
        JSON.stringify({
          error: "Crypto payments are not configured yet. The site owner must add a receiving wallet address.",
          not_configured: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 503 },
      );
    }

    const chain = CHAINS[config.chain];
    if (!chain) throw new Error(`Unsupported chain: ${config.chain}`);
    if (!isValidEvmAddress(config.wallet_address)) {
      throw new Error("Configured receiving wallet address is not a valid EVM address");
    }

    // Reuse an in-flight invoice so refreshing the page doesn't burn amounts
    const { data: existing } = await supabase
      .from("crypto_invoices")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let invoice = existing;

    if (!invoice) {
      const basePrice = Number(config.price_usd);

      for (let attempt = 0; attempt < MAX_AMOUNT_ATTEMPTS; attempt++) {
        const amount = buildUniqueAmount(basePrice);
        const { data: created, error: insertError } = await supabase
          .from("crypto_invoices")
          .insert({
            user_id: user.id,
            amount_usdc: amount,
            wallet_address: config.wallet_address,
            chain: config.chain,
            token: config.token,
            expires_at: new Date(Date.now() + INVOICE_TTL_MINUTES * 60_000).toISOString(),
          })
          .select()
          .single();

        if (!insertError) {
          invoice = created;
          break;
        }

        // 23505 = unique violation: that exact amount is already reserved
        if ((insertError as { code?: string }).code !== "23505") {
          throw new Error(`Could not create invoice: ${insertError.message}`);
        }
        logStep("Amount collision, retrying", { attempt, amount });
      }

      if (!invoice) {
        throw new Error("Could not allocate a unique payment amount, please try again");
      }
      logStep("Invoice created", { invoiceId: invoice.id, amount: invoice.amount_usdc });
    } else {
      logStep("Reusing pending invoice", { invoiceId: invoice.id });
    }

    const amountBaseUnits = toBaseUnits(String(invoice.amount_usdc), chain.usdcDecimals);

    return new Response(JSON.stringify({
      invoice_id: invoice.id,
      amount: String(invoice.amount_usdc),
      amount_base_units: amountBaseUnits.toString(),
      wallet_address: invoice.wallet_address,
      chain: invoice.chain,
      chain_name: chain.name,
      chain_id: chain.chainId,
      token: invoice.token,
      token_address: chain.usdcAddress,
      payment_uri: buildPaymentUri(chain, invoice.wallet_address, amountBaseUnits),
      expires_at: invoice.expires_at,
      status: invoice.status,
    }), {
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

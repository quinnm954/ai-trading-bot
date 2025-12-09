import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchCoinbaseBalance(): Promise<{
  balance: number;
  buying_power: number;
  equity: number;
}> {
  const apiKey = Deno.env.get("COINBASE_API_KEY");
  const apiSecret = Deno.env.get("COINBASE_API_SECRET");

  if (!apiKey || !apiSecret) {
    throw new Error("Coinbase API credentials not configured");
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const requestPath = "/api/v3/brokerage/accounts";
  
  const message = timestamp + method + requestPath;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(apiSecret);
  const messageData = encoder.encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  console.log("Fetching Coinbase accounts...");
  
  const response = await fetch("https://api.coinbase.com" + requestPath, {
    method: "GET",
    headers: {
      "CB-ACCESS-KEY": apiKey,
      "CB-ACCESS-SIGN": signatureBase64,
      "CB-ACCESS-TIMESTAMP": timestamp,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Coinbase API error:", response.status, errorText);
    throw new Error(`Coinbase API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  console.log("Coinbase accounts response:", JSON.stringify(data, null, 2));
  
  let totalBalance = 0;
  let usdBalance = 0;
  
  if (data.accounts && Array.isArray(data.accounts)) {
    for (const account of data.accounts) {
      // Get USD value of available balance
      if (account.available_balance && account.available_balance.value) {
        const value = parseFloat(account.available_balance.value);
        
        // If currency is USD, add directly
        if (account.currency === "USD" || account.available_balance.currency === "USD") {
          usdBalance += value;
          console.log(`USD account: $${value}`);
        }
        
        // For now, we'll focus on USD balance only for "cash"
        // Crypto holdings would need price conversion
      }
    }
  }

  console.log(`Total USD balance: $${usdBalance}`);

  return {
    balance: usdBalance,
    buying_power: usdBalance,
    equity: usdBalance,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // User client for auth
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Service client for DB operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get connected API connections for user
    const { data: connections, error: connError } = await serviceClient
      .from("api_connections")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_connected", true);

    if (connError) {
      throw new Error(`Failed to fetch connections: ${connError.message}`);
    }

    if (!connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No connected brokers", synced: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const synced = [];
    const results: Record<string, any> = {};

    for (const conn of connections) {
      try {
        console.log(`Syncing ${conn.provider} account for user ${user.id}`);
        
        if (conn.provider === "coinbase") {
          const balanceData = await fetchCoinbaseBalance();
          
          console.log(`Coinbase balance fetched: $${balanceData.balance}`);
          
          // Upsert live account with actual balance
          const { error: upsertError } = await serviceClient
            .from("live_account")
            .upsert({
              user_id: user.id,
              provider: conn.provider,
              balance: balanceData.balance,
              buying_power: balanceData.buying_power,
              equity: balanceData.equity,
              last_synced_at: new Date().toISOString(),
            }, {
              onConflict: "user_id,provider",
            });

          if (upsertError) {
            // Try update instead
            const { error: updateError } = await serviceClient
              .from("live_account")
              .update({
                balance: balanceData.balance,
                buying_power: balanceData.buying_power,
                equity: balanceData.equity,
                last_synced_at: new Date().toISOString(),
              })
              .eq("user_id", user.id)
              .eq("provider", conn.provider);

            if (updateError) {
              console.error("Update error:", updateError);
              throw updateError;
            }
          }
          
          synced.push(conn.provider);
          results[conn.provider] = balanceData;
        }
      } catch (err: any) {
        console.error(`Error syncing ${conn.provider}:`, err);
        results[conn.provider] = { error: err.message };
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error syncing broker balances:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || "Failed to sync balances" 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

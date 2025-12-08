import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchAlpacaAccount(apiKey: string, secretKey: string) {
  const response = await fetch("https://paper-api.alpaca.markets/v2/account", {
    method: "GET",
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": secretKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Alpaca API error: ${response.status}`);
  }

  const account = await response.json();
  
  return {
    balance: parseFloat(account.cash || 0),
    buying_power: parseFloat(account.buying_power || 0),
    equity: parseFloat(account.equity || 0),
  };
}

async function fetchCoinbaseAccount(apiKey: string, secretKey: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const requestPath = "/api/v3/brokerage/accounts";
  
  const message = timestamp + method + requestPath;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secretKey);
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
    throw new Error(`Coinbase API error: ${response.status}`);
  }

  const data = await response.json();
  
  let totalBalance = 0;
  if (data.accounts && Array.isArray(data.accounts)) {
    for (const account of data.accounts) {
      if (account.available_balance && account.available_balance.value) {
        totalBalance += parseFloat(account.available_balance.value);
      }
    }
  }

  return {
    balance: totalBalance,
    buying_power: totalBalance,
    equity: totalBalance,
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

    for (const conn of connections) {
      try {
        // Note: In production, credentials should be stored encrypted
        // For now we'll skip the actual sync if no credentials are available
        // This is a placeholder for when proper credential storage is implemented
        
        console.log(`Syncing ${conn.provider} account for user ${user.id}`);
        
        // Update last_synced_at timestamp
        const { error: updateError } = await serviceClient
          .from("live_account")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .eq("provider", conn.provider);

        if (!updateError) {
          synced.push(conn.provider);
        }
      } catch (err) {
        console.error(`Error syncing ${conn.provider}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced }),
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

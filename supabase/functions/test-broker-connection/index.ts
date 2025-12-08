import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BrokerCredentials {
  provider: 'alpaca' | 'coinbase';
  apiKey: string;
  secretKey: string;
  passphrase?: string;
}

async function testAlpacaConnection(apiKey: string, secretKey: string) {
  // Test with Alpaca paper trading API
  const response = await fetch("https://paper-api.alpaca.markets/v2/account", {
    method: "GET",
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": secretKey,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Alpaca API error: ${error}`);
  }

  const account = await response.json();
  
  return {
    success: true,
    accountInfo: {
      balance: parseFloat(account.cash || 0),
      buying_power: parseFloat(account.buying_power || 0),
      equity: parseFloat(account.equity || 0),
    },
  };
}

async function testCoinbaseConnection(apiKey: string, secretKey: string, passphrase?: string) {
  // Coinbase has two API types:
  // 1. Legacy Exchange API - uses HMAC + passphrase (secret is base64 encoded)
  // 2. CDP Advanced Trade API - uses JWT with EC private key
  
  // Detect if this is a CDP API key (starts with "organizations/")
  const isCdpKey = apiKey.startsWith("organizations/");
  
  if (isCdpKey) {
    // CDP API uses JWT authentication - not yet supported
    throw new Error("CDP API keys (starting with 'organizations/') require JWT authentication. Please use Legacy API keys from the Coinbase Exchange API settings, or create API keys in the Coinbase Developer Platform with REST API access.");
  }
  
  // Legacy Exchange API authentication
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const requestPath = "/api/v3/brokerage/accounts";
  const body = "";
  
  // Create signature - secret key is base64 encoded, must decode first
  const message = timestamp + method + requestPath + body;
  
  let decodedSecret: ArrayBuffer;
  try {
    const binaryString = atob(secretKey);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    decodedSecret = bytes.buffer;
  } catch (e) {
    throw new Error("Invalid secret key format. The secret key should be base64 encoded. Please check your Coinbase API credentials.");
  }
  
  const messageData = new TextEncoder().encode(message);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    decodedSecret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));

  const headers: Record<string, string> = {
    "CB-ACCESS-KEY": apiKey,
    "CB-ACCESS-SIGN": signatureBase64,
    "CB-ACCESS-TIMESTAMP": timestamp,
    "Content-Type": "application/json",
  };

  // Passphrase is required for legacy Exchange API
  if (passphrase) {
    headers["CB-ACCESS-PASSPHRASE"] = passphrase;
  } else {
    throw new Error("Passphrase is required for Coinbase Exchange API authentication. Please provide your API passphrase.");
  }

  console.log("Attempting Coinbase connection with timestamp:", timestamp);
  
  const response = await fetch("https://api.coinbase.com" + requestPath, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Coinbase API error response:", response.status, errorText);
    
    if (response.status === 401) {
      throw new Error("Invalid API credentials. Please verify your API Key, Secret, and Passphrase are correct. Make sure you're using Coinbase Exchange API keys (not CDP keys).");
    }
    throw new Error(`Coinbase API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  
  // Calculate total balance from all accounts
  let totalBalance = 0;
  if (data.accounts && Array.isArray(data.accounts)) {
    for (const account of data.accounts) {
      if (account.available_balance && account.available_balance.value) {
        totalBalance += parseFloat(account.available_balance.value);
      }
    }
  }

  return {
    success: true,
    accountInfo: {
      balance: totalBalance,
      buying_power: totalBalance,
      equity: totalBalance,
    },
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const body: BrokerCredentials = await req.json();
    const { provider, apiKey, secretKey, passphrase } = body;

    if (!provider || !apiKey || !secretKey) {
      throw new Error("Missing required credentials");
    }

    let result;

    if (provider === "alpaca") {
      result = await testAlpacaConnection(apiKey, secretKey);
    } else if (provider === "coinbase") {
      result = await testCoinbaseConnection(apiKey, secretKey, passphrase);
    } else {
      throw new Error("Unsupported provider");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error testing broker connection:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: error.message || "Failed to test connection" 
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64UrlEncode } from "https://deno.land/std@0.168.0/encoding/base64url.ts";

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

// Generate JWT for CDP API authentication
async function generateCdpJwt(apiKey: string, privateKeyPem: string): Promise<string> {
  const currentTime = Math.floor(Date.now() / 1000);
  
  // JWT header
  const header = {
    alg: "ES256",
    kid: apiKey,
    nonce: crypto.randomUUID(),
    typ: "JWT"
  };
  
  // JWT payload
  const payload = {
    iss: "cdp",
    nbf: currentTime,
    exp: currentTime + 120, // Valid for 2 minutes
    sub: apiKey,
  };
  
  // Clean up the private key - handle both formats
  let cleanKey = privateKeyPem.trim();
  
  // If it doesn't have PEM headers, try to add them
  if (!cleanKey.includes("-----BEGIN")) {
    // Remove any whitespace and newlines
    cleanKey = cleanKey.replace(/\s/g, '');
    cleanKey = `-----BEGIN EC PRIVATE KEY-----\n${cleanKey}\n-----END EC PRIVATE KEY-----`;
  }
  
  // Parse the PEM key
  const pemContents = cleanKey
    .replace("-----BEGIN EC PRIVATE KEY-----", "")
    .replace("-----END EC PRIVATE KEY-----", "")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  
  // Decode base64 to get the key bytes
  const binaryString = atob(pemContents);
  const keyBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyBytes[i] = binaryString.charCodeAt(i);
  }
  
  // Import the EC private key
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  
  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  
  // Sign the JWT
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  
  // Convert DER signature to raw format (r || s)
  const signatureArray = new Uint8Array(signature);
  const encodedSignature = base64UrlEncode(signatureArray.buffer);
  
  return `${signingInput}.${encodedSignature}`;
}

async function testCoinbaseConnection(apiKey: string, secretKey: string, passphrase?: string) {
  // Detect if this is a CDP API key by checking:
  // 1. API key starts with "organizations/"
  // 2. Secret key looks like a PEM private key (contains BEGIN or is very long)
  const isCdpKey = apiKey.startsWith("organizations/") || 
                   secretKey.includes("-----BEGIN") || 
                   secretKey.includes("PRIVATE KEY") ||
                   secretKey.length > 200; // PEM keys are typically very long
  
  if (isCdpKey) {
    // CDP API uses JWT authentication
    console.log("Using CDP JWT authentication for Coinbase");
    
    try {
      const jwt = await generateCdpJwt(apiKey, secretKey);
      
      const response = await fetch("https://api.coinbase.com/api/v3/brokerage/accounts", {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("Coinbase CDP API error:", response.status, errorText);
        
        if (response.status === 401) {
          throw new Error("Invalid CDP API credentials. Please verify your API Key and Private Key are correct.");
        }
        throw new Error(`Coinbase API error (${response.status}): ${errorText}`);
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
        success: true,
        accountInfo: {
          balance: totalBalance,
          buying_power: totalBalance,
          equity: totalBalance,
        },
      };
    } catch (e: any) {
      console.error("CDP JWT error:", e);
      if (e.message.includes("Invalid")) {
        throw e;
      }
      throw new Error(`Failed to authenticate with CDP API. Please ensure your private key is in the correct format (EC Private Key PEM). Error: ${e.message}`);
    }
  }
  
  // Legacy Exchange API authentication
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const requestPath = "/api/v3/brokerage/accounts";
  const body = "";
  
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

  if (passphrase) {
    headers["CB-ACCESS-PASSPHRASE"] = passphrase;
  } else {
    throw new Error("Passphrase is required for Coinbase Exchange API authentication. Please provide your API passphrase.");
  }

  console.log("Attempting Coinbase legacy connection with timestamp:", timestamp);
  
  const response = await fetch("https://api.coinbase.com" + requestPath, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Coinbase API error response:", response.status, errorText);
    
    if (response.status === 401) {
      throw new Error("Invalid API credentials. Please verify your API Key, Secret, and Passphrase are correct.");
    }
    throw new Error(`Coinbase API error (${response.status}): ${errorText}`);
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

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
  
  // Clean up the private key - handle various formats and escape sequences
  let cleanKey = privateKeyPem.trim();
  
  // Handle escaped newlines (e.g., literal "\n" strings from JSON or copy-paste)
  cleanKey = cleanKey.replace(/\\n/g, '\n').replace(/\\r/g, '');
  
  // Normalize line endings
  cleanKey = cleanKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  console.log("Processing private key, original length:", privateKeyPem.length, "cleaned length:", cleanKey.length);
  console.log("Key starts with:", cleanKey.substring(0, 50));
  
  // Extract just the base64 content from the PEM
  let pemContents: string;
  
  if (cleanKey.includes("-----BEGIN")) {
    // It's a PEM formatted key - extract content between headers
    const beginMatch = cleanKey.match(/-----BEGIN[^-]+-----/);
    const endMatch = cleanKey.match(/-----END[^-]+-----/);
    
    if (beginMatch && endMatch) {
      const startIdx = cleanKey.indexOf(beginMatch[0]) + beginMatch[0].length;
      const endIdx = cleanKey.indexOf(endMatch[0]);
      pemContents = cleanKey.substring(startIdx, endIdx);
    } else {
      // Fallback: just remove known headers
      pemContents = cleanKey
        .replace(/-----BEGIN EC PRIVATE KEY-----/g, "")
        .replace(/-----END EC PRIVATE KEY-----/g, "")
        .replace(/-----BEGIN PRIVATE KEY-----/g, "")
        .replace(/-----END PRIVATE KEY-----/g, "");
    }
    
    // Remove ALL whitespace including newlines
    pemContents = pemContents.replace(/\s+/g, "");
  } else {
    // Assume it's raw base64, just clean whitespace
    pemContents = cleanKey.replace(/\s+/g, "");
  }
  
  console.log("PEM contents length after cleanup:", pemContents.length);
  console.log("First 20 chars of base64:", pemContents.substring(0, 20));
  
  // Validate base64 characters - be more lenient and filter out invalid chars
  const validBase64 = pemContents.replace(/[^A-Za-z0-9+/=]/g, "");
  
  if (validBase64.length === 0) {
    throw new Error("Private key appears to be empty or contains no valid base64 content. Please paste the complete EC private key including the -----BEGIN and -----END lines.");
  }
  
  if (validBase64.length !== pemContents.length) {
    console.log("Removed", pemContents.length - validBase64.length, "invalid characters from base64");
    pemContents = validBase64;
  }
  
  // Decode base64 to get the key bytes
  let keyBytes: Uint8Array;
  try {
    const binaryString = atob(pemContents);
    keyBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      keyBytes[i] = binaryString.charCodeAt(i);
    }
  } catch (e: any) {
    throw new Error(`Failed to decode private key: ${e.message}`);
  }
  
  console.log("Key bytes length:", keyBytes.length);
  
  // Import the EC private key - try PKCS8 format first, then SEC1 (EC)
  let cryptoKey: CryptoKey;
  const keyBuffer = new ArrayBuffer(keyBytes.length);
  new Uint8Array(keyBuffer).set(keyBytes);
  try {
    // Try PKCS8 format first (-----BEGIN PRIVATE KEY-----)
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyBuffer,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
  } catch (pkcs8Error) {
    console.log("PKCS8 import failed, trying SEC1/EC format...");
    try {
      // Try SEC1/EC format (-----BEGIN EC PRIVATE KEY-----)
      // SEC1 keys need to be wrapped in PKCS8 format for Web Crypto API
      // For now, we'll provide a helpful error message
      throw new Error("EC Private Key format detected. Please use a PKCS8 format key (-----BEGIN PRIVATE KEY-----) or contact support for EC key format handling.");
    } catch (ecError: any) {
      throw new Error(`Unable to import private key. Ensure it's a valid EC P-256 private key. ${ecError.message}`);
    }
  }
  
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
  
  // Convert signature to base64url
  const encodedSignature = base64UrlEncode(new Uint8Array(signature).buffer);
  
  return `${signingInput}.${encodedSignature}`;
}

async function testCoinbaseConnection(apiKey: string, secretKey: string, passphrase?: string) {
  // Detect if this is a CDP API key
  // Primary indicator: API key starts with "organizations/"
  // Secondary indicators: Secret key looks like a PEM private key
  const isCdpKey = apiKey.startsWith("organizations/") || 
                   secretKey.includes("-----BEGIN") || 
                   secretKey.includes("PRIVATE KEY");
  
  console.log("Coinbase key detection - isCdpKey:", isCdpKey, "apiKey prefix:", apiKey.substring(0, 20));
  
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

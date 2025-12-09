import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

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

// Generate JWT for CDP API authentication using jose library
// uri format: "METHOD api.coinbase.com/path" e.g. "GET api.coinbase.com/api/v3/brokerage/accounts"
async function generateCdpJwt(apiKey: string, privateKeyPem: string, uri: string): Promise<string> {
  // Clean up the private key - handle various formats and escape sequences
  let cleanKey = privateKeyPem.trim();
  
  // Handle escaped newlines (e.g., literal "\n" strings from JSON or copy-paste)
  cleanKey = cleanKey.replace(/\\n/g, '\n').replace(/\\r/g, '');
  
  // Normalize line endings
  cleanKey = cleanKey.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  console.log("Processing private key, original length:", privateKeyPem.length, "cleaned length:", cleanKey.length);
  console.log("Key starts with:", cleanKey.substring(0, 50));
  
  // Ensure the key has proper PEM headers
  if (!cleanKey.includes("-----BEGIN")) {
    // Try to wrap it as EC private key
    cleanKey = `-----BEGIN EC PRIVATE KEY-----\n${cleanKey}\n-----END EC PRIVATE KEY-----`;
  }
  
  let privateKey: jose.KeyLike;
  
  try {
    // First try importing as PKCS8 (-----BEGIN PRIVATE KEY-----)
    if (cleanKey.includes("-----BEGIN PRIVATE KEY-----")) {
      privateKey = await jose.importPKCS8(cleanKey, "ES256");
      console.log("Successfully imported as PKCS8");
    } else {
      // For SEC1 EC keys, we need to convert them first
      // jose doesn't directly support SEC1, so we'll use a workaround
      // Try importing directly - some runtimes support it
      try {
        privateKey = await jose.importPKCS8(cleanKey, "ES256");
        console.log("Successfully imported EC key");
      } catch {
        // Extract the base64 content and try to import as JWK
        console.log("Direct import failed, attempting manual conversion...");
        
        // Parse the PEM to extract the key data
        const pemContents = cleanKey
          .replace(/-----BEGIN EC PRIVATE KEY-----/g, "")
          .replace(/-----END EC PRIVATE KEY-----/g, "")
          .replace(/\s+/g, "");
        
        // Decode the base64 SEC1 structure
        const binaryString = atob(pemContents);
        const keyBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          keyBytes[i] = binaryString.charCodeAt(i);
        }
        
        console.log("Key bytes length:", keyBytes.length);
        
        // Parse SEC1 ASN.1 to extract private key 'd' value and optional public key
        let offset = 0;
        
        // SEQUENCE
        if (keyBytes[offset++] !== 0x30) throw new Error("Invalid SEC1: expected SEQUENCE");
        let seqLen = keyBytes[offset++];
        if (seqLen & 0x80) {
          const lenBytes = seqLen & 0x7f;
          seqLen = 0;
          for (let i = 0; i < lenBytes; i++) {
            seqLen = (seqLen << 8) | keyBytes[offset++];
          }
        }
        
        // Version (INTEGER, should be 1)
        if (keyBytes[offset++] !== 0x02) throw new Error("Invalid SEC1: expected INTEGER");
        const versionLen = keyBytes[offset++];
        offset += versionLen;
        
        // Private key (OCTET STRING)
        if (keyBytes[offset++] !== 0x04) throw new Error("Invalid SEC1: expected OCTET STRING");
        const privKeyLen = keyBytes[offset++];
        const dBytes = keyBytes.slice(offset, offset + privKeyLen);
        offset += privKeyLen;
        
        console.log("Extracted d value, length:", dBytes.length);
        
        // Look for public key [1] BIT STRING
        let xBytes: Uint8Array | null = null;
        let yBytes: Uint8Array | null = null;
        
        while (offset < keyBytes.length) {
          const tag = keyBytes[offset++];
          let len = keyBytes[offset++];
          if (len & 0x80) {
            const lenBytes = len & 0x7f;
            len = 0;
            for (let i = 0; i < lenBytes; i++) {
              len = (len << 8) | keyBytes[offset++];
            }
          }
          
          if (tag === 0xa1) { // [1] public key
            // Skip BIT STRING wrapper
            if (keyBytes[offset] === 0x03) {
              offset++;
              let bitStringLen = keyBytes[offset++];
              if (bitStringLen & 0x80) {
                const lenBytes = bitStringLen & 0x7f;
                bitStringLen = 0;
                for (let i = 0; i < lenBytes; i++) {
                  bitStringLen = (bitStringLen << 8) | keyBytes[offset++];
                }
              }
              offset++; // Skip unused bits byte
              
              // Public key should start with 0x04 (uncompressed point)
              if (keyBytes[offset] === 0x04) {
                offset++;
                xBytes = keyBytes.slice(offset, offset + 32);
                yBytes = keyBytes.slice(offset + 32, offset + 64);
              }
            }
            break;
          }
          offset += len;
        }
        
        // Convert to base64url
        const base64url = (bytes: Uint8Array) => {
          const base64 = btoa(String.fromCharCode(...bytes));
          return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        };
        
        // Create JWK
        const jwk: jose.JWK = {
          kty: "EC",
          crv: "P-256",
          d: base64url(dBytes),
        };
        
        if (xBytes && yBytes) {
          jwk.x = base64url(xBytes);
          jwk.y = base64url(yBytes);
        }
        
        console.log("Created JWK with d length:", dBytes.length);
        
        privateKey = await jose.importJWK(jwk, "ES256") as jose.KeyLike;
        console.log("Successfully imported as JWK");
      }
    }
  } catch (e: any) {
    console.error("Key import error:", e);
    throw new Error(`Failed to import private key: ${e.message}`);
  }
  
  // Build and sign the JWT with the uri claim
  const jwt = await new jose.SignJWT({
    iss: "cdp",
    sub: apiKey,
    uri: uri,
  })
    .setProtectedHeader({ 
      alg: "ES256", 
      kid: apiKey,
      nonce: crypto.randomUUID(),
      typ: "JWT"
    })
    .setIssuedAt()
    .setNotBefore(Math.floor(Date.now() / 1000))
    .setExpirationTime("2m")
    .sign(privateKey);
  
  console.log("JWT generated successfully for URI:", uri, "length:", jwt.length);
  return jwt;
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
      const requestPath = "/api/v3/brokerage/accounts";
      const uri = `GET api.coinbase.com${requestPath}`;
      const jwt = await generateCdpJwt(apiKey, secretKey, uri);
      
      const response = await fetch(`https://api.coinbase.com${requestPath}`, {
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

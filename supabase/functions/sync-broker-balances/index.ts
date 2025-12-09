import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate JWT for Coinbase CDP API
async function generateCdpJwt(apiKey: string, privateKeyPem: string, uri: string): Promise<string> {
  let cleanKey = privateKeyPem.trim()
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  if (!cleanKey.includes("-----BEGIN")) {
    cleanKey = `-----BEGIN EC PRIVATE KEY-----\n${cleanKey}\n-----END EC PRIVATE KEY-----`;
  }
  
  let privateKey: jose.KeyLike;
  
  try {
    if (cleanKey.includes("-----BEGIN PRIVATE KEY-----")) {
      privateKey = await jose.importPKCS8(cleanKey, "ES256");
    } else {
      try {
        privateKey = await jose.importPKCS8(cleanKey, "ES256");
      } catch {
        // Parse SEC1 format manually
        const pemContents = cleanKey
          .replace(/-----BEGIN EC PRIVATE KEY-----/g, "")
          .replace(/-----END EC PRIVATE KEY-----/g, "")
          .replace(/\s+/g, "");
        
        const binaryString = atob(pemContents);
        const keyBytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          keyBytes[i] = binaryString.charCodeAt(i);
        }
        
        // Parse ASN.1 to extract private key
        let offset = 0;
        if (keyBytes[offset++] !== 0x30) throw new Error("Invalid SEC1");
        let seqLen = keyBytes[offset++];
        if (seqLen & 0x80) {
          const lenBytes = seqLen & 0x7f;
          seqLen = 0;
          for (let i = 0; i < lenBytes; i++) seqLen = (seqLen << 8) | keyBytes[offset++];
        }
        
        if (keyBytes[offset++] !== 0x02) throw new Error("Invalid SEC1");
        offset += keyBytes[offset++];
        
        if (keyBytes[offset++] !== 0x04) throw new Error("Invalid SEC1");
        const privKeyLen = keyBytes[offset++];
        const dBytes = keyBytes.slice(offset, offset + privKeyLen);
        offset += privKeyLen;
        
        let xBytes: Uint8Array | null = null;
        let yBytes: Uint8Array | null = null;
        
        while (offset < keyBytes.length) {
          const tag = keyBytes[offset++];
          let len = keyBytes[offset++];
          if (len & 0x80) {
            const lenBytes = len & 0x7f;
            len = 0;
            for (let i = 0; i < lenBytes; i++) len = (len << 8) | keyBytes[offset++];
          }
          
          if (tag === 0xa1) {
            if (keyBytes[offset] === 0x03) {
              offset++;
              let bitStringLen = keyBytes[offset++];
              if (bitStringLen & 0x80) {
                const lenBytes = bitStringLen & 0x7f;
                bitStringLen = 0;
                for (let i = 0; i < lenBytes; i++) bitStringLen = (bitStringLen << 8) | keyBytes[offset++];
              }
              offset++;
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
        
        const base64url = (bytes: Uint8Array) => 
          btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        
        const jwk: jose.JWK = { kty: "EC", crv: "P-256", d: base64url(dBytes) };
        if (xBytes && yBytes) { jwk.x = base64url(xBytes); jwk.y = base64url(yBytes); }
        
        privateKey = await jose.importJWK(jwk, "ES256") as jose.KeyLike;
      }
    }
  } catch (e: any) {
    throw new Error(`Failed to import private key: ${e.message}`);
  }
  
  return await new jose.SignJWT({ iss: "cdp", sub: apiKey, uri })
    .setProtectedHeader({ alg: "ES256", kid: apiKey, nonce: crypto.randomUUID(), typ: "JWT" })
    .setIssuedAt()
    .setNotBefore(Math.floor(Date.now() / 1000))
    .setExpirationTime("2m")
    .sign(privateKey);
}

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

  // Detect if this is CDP format
  const isCdp = apiKey.startsWith("organizations/") || apiSecret.includes("-----BEGIN");

  console.log(`Fetching Coinbase accounts using ${isCdp ? "CDP JWT" : "Legacy HMAC"} auth...`);

  const requestPath = "/api/v3/brokerage/accounts";

  let response: Response;

  if (isCdp) {
    // CDP authentication with JWT
    const jwt = await generateCdpJwt(apiKey, apiSecret, `GET api.coinbase.com${requestPath}`);
    
    response = await fetch(`https://api.coinbase.com${requestPath}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });
  } else {
    // Legacy HMAC authentication
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const method = "GET";
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

    response = await fetch("https://api.coinbase.com" + requestPath, {
      method: "GET",
      headers: {
        "CB-ACCESS-KEY": apiKey,
        "CB-ACCESS-SIGN": signatureBase64,
        "CB-ACCESS-TIMESTAMP": timestamp,
        "Content-Type": "application/json",
      },
    });
  }

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

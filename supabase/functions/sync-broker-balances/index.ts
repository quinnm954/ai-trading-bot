import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate JWT for Coinbase CDP API
async function generateCdpJwt(apiKey: string, privateKeyPem: string, uri: string): Promise<string> {
  console.log("Parsing private key...");
  
  // Clean and normalize the key
  let cleanKey = privateKeyPem.trim()
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  // If key doesn't have PEM headers, try to add them
  if (!cleanKey.includes("-----BEGIN")) {
    // Check if it looks like base64 content
    if (/^[A-Za-z0-9+/=\s]+$/.test(cleanKey.replace(/\s/g, ''))) {
      cleanKey = `-----BEGIN EC PRIVATE KEY-----\n${cleanKey}\n-----END EC PRIVATE KEY-----`;
    }
  }
  
  console.log("Key format detected:", cleanKey.includes("PRIVATE KEY") ? "PEM" : "unknown");
  
  let privateKey: jose.KeyLike;
  
  // Try multiple import methods
  const importMethods = [
    // Method 1: Direct PKCS8 import
    async () => {
      console.log("Trying PKCS8 import...");
      return await jose.importPKCS8(cleanKey, "ES256");
    },
    // Method 2: Try with reformatted PKCS8 header
    async () => {
      console.log("Trying reformatted PKCS8...");
      const pemContent = cleanKey
        .replace(/-----BEGIN.*-----/g, "")
        .replace(/-----END.*-----/g, "")
        .replace(/\s+/g, "");
      const reformatted = `-----BEGIN PRIVATE KEY-----\n${pemContent}\n-----END PRIVATE KEY-----`;
      return await jose.importPKCS8(reformatted, "ES256");
    },
    // Method 3: Parse SEC1 EC key manually
    async () => {
      console.log("Trying SEC1 manual parse...");
      const pemContents = cleanKey
        .replace(/-----BEGIN.*-----/g, "")
        .replace(/-----END.*-----/g, "")
        .replace(/\s+/g, "");
      
      const binaryString = atob(pemContents);
      const keyBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        keyBytes[i] = binaryString.charCodeAt(i);
      }
      
      // For P-256, the private key is 32 bytes
      // Try to extract it from various positions in the ASN.1 structure
      let dBytes: Uint8Array | null = null;
      
      // Look for the 32-byte private key value
      for (let i = 0; i < keyBytes.length - 32; i++) {
        // Check if this could be an OCTET STRING containing 32 bytes
        if (keyBytes[i] === 0x04 && keyBytes[i + 1] === 0x20) {
          dBytes = keyBytes.slice(i + 2, i + 34);
          break;
        }
      }
      
      if (!dBytes) {
        // Try finding a 32-byte sequence after common ASN.1 patterns
        for (let i = 7; i < keyBytes.length - 32; i++) {
          if (keyBytes[i - 1] === 0x20 || keyBytes[i - 1] === 0x21) {
            const candidate = keyBytes.slice(i, i + 32);
            // Check if it looks like a valid private key (not all zeros, not all same byte)
            const unique = new Set(candidate);
            if (unique.size > 5) {
              dBytes = candidate;
              break;
            }
          }
        }
      }
      
      if (!dBytes) {
        throw new Error("Could not extract private key bytes");
      }
      
      const base64url = (bytes: Uint8Array) => 
        btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
      
      // Create JWK with just the d parameter
      const jwk: jose.JWK = {
        kty: "EC",
        crv: "P-256",
        d: base64url(dBytes),
        // Generate x and y from the key if present in the data
        x: base64url(new Uint8Array(32)), // Placeholder
        y: base64url(new Uint8Array(32)), // Placeholder
      };
      
      // Try to find public key coordinates in the data
      for (let i = 0; i < keyBytes.length - 65; i++) {
        if (keyBytes[i] === 0x04 && i + 65 <= keyBytes.length) {
          // Uncompressed point format
          const nextBytes = keyBytes.slice(i, i + 65);
          if (nextBytes[0] === 0x04) {
            jwk.x = base64url(nextBytes.slice(1, 33));
            jwk.y = base64url(nextBytes.slice(33, 65));
            break;
          }
        }
      }
      
      return await jose.importJWK(jwk, "ES256") as jose.KeyLike;
    },
    // Method 4: Try direct JWK if the key is in JSON format
    async () => {
      console.log("Trying JWK import...");
      const jwk = JSON.parse(cleanKey);
      return await jose.importJWK(jwk, "ES256") as jose.KeyLike;
    },
  ];
  
  for (const method of importMethods) {
    try {
      privateKey = await method();
      console.log("Key import successful!");
      
      return await new jose.SignJWT({ iss: "cdp", sub: apiKey, uri })
        .setProtectedHeader({ alg: "ES256", kid: apiKey, nonce: crypto.randomUUID(), typ: "JWT" })
        .setIssuedAt()
        .setNotBefore(Math.floor(Date.now() / 1000))
        .setExpirationTime("2m")
        .sign(privateKey);
    } catch (e: any) {
      console.log(`Import method failed: ${e.message}`);
      continue;
    }
  }
  
  throw new Error("All key import methods failed. Please check the private key format.");
}

async function fetchCoinbaseBalanceAndHoldings(): Promise<{
  balance: number;
  buying_power: number;
  equity: number;
  holdings: Array<{ symbol: string; quantity: number; value: number }>;
}> {
  const apiKey = Deno.env.get("COINBASE_API_KEY");
  const apiSecret = Deno.env.get("COINBASE_API_SECRET");

  if (!apiKey || !apiSecret) {
    throw new Error("Coinbase API credentials not configured");
  }

  const isCdp = apiKey.startsWith("organizations/") || apiSecret.includes("-----BEGIN");
  console.log(`Fetching Coinbase accounts using ${isCdp ? "CDP JWT" : "Legacy HMAC"} auth...`);

  const requestPath = "/api/v3/brokerage/accounts";
  let response: Response;

  if (isCdp) {
    const jwt = await generateCdpJwt(apiKey, apiSecret, `GET api.coinbase.com${requestPath}`);
    response = await fetch(`https://api.coinbase.com${requestPath}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${jwt}`,
        "Content-Type": "application/json",
      },
    });
  } else {
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
  
  let cashBalance = 0;
  const holdings: Array<{ symbol: string; quantity: number; value: number }> = [];
  
  const stablecoins = ["USD", "USDC", "USDT", "PYUSD", "USD1", "DAI", "BUSD", "GUSD", "USDP", "TUSD"];
  
  if (data.accounts && Array.isArray(data.accounts)) {
    for (const account of data.accounts) {
      if (account.available_balance && account.available_balance.value) {
        const value = parseFloat(account.available_balance.value);
        const currency = account.currency || account.available_balance.currency;
        
        if (value > 0) {
          if (stablecoins.includes(currency)) {
            cashBalance += value;
            console.log(`💵 ${currency} balance: $${value.toFixed(2)}`);
          } else {
            // This is a crypto holding
            holdings.push({
              symbol: currency,
              quantity: value,
              value: 0, // Will be calculated with live prices
            });
            console.log(`📊 ${currency} holding: ${value}`);
          }
        }
      }
    }
  }

  console.log(`✅ Cash: $${cashBalance.toFixed(2)}, Holdings: ${holdings.length} assets`);

  return {
    balance: cashBalance,
    buying_power: cashBalance,
    equity: cashBalance,
    holdings,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if this is a cron job call (no auth header) or user call
    const authHeader = req.headers.get("Authorization");
    const url = new URL(req.url);
    const isCron = url.searchParams.get("cron") === "true" || !authHeader;
    
    let usersToSync: string[] = [];
    
    if (isCron) {
      // Cron job: sync all users with connected brokers
      console.log("🔄 Cron job: Syncing all connected broker accounts");
      
      const { data: connections, error: connError } = await serviceClient
        .from("api_connections")
        .select("user_id")
        .eq("is_connected", true);
      
      if (connError) {
        throw new Error(`Failed to fetch connections: ${connError.message}`);
      }
      
      // Get unique user IDs
      usersToSync = [...new Set(connections?.map(c => c.user_id).filter(Boolean) as string[])];
      console.log(`Found ${usersToSync.length} users to sync`);
    } else {
      // User call: sync only this user
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        throw new Error("Unauthorized");
      }
      usersToSync = [user.id];
    }

    const allResults: Record<string, any> = {};
    
    for (const userId of usersToSync) {
      // Get connected API connections for user
      const { data: connections, error: connError } = await serviceClient
        .from("api_connections")
        .select("*")
        .eq("user_id", userId)
        .eq("is_connected", true);

      if (connError) {
        console.error(`Failed to fetch connections for ${userId}: ${connError.message}`);
        continue;
      }

      if (!connections || connections.length === 0) {
        continue;
      }

      for (const conn of connections) {
        try {
          console.log(`Syncing ${conn.provider} account for user ${userId}`);
          
          if (conn.provider === "coinbase") {
            const balanceData = await fetchCoinbaseBalanceAndHoldings();
            
            console.log(`✅ Coinbase synced: $${balanceData.balance.toFixed(2)} cash, ${balanceData.holdings.length} holdings`);
            
            // Upsert live account with actual balance
            const { error: upsertError } = await serviceClient
              .from("live_account")
              .upsert({
                user_id: userId,
                provider: conn.provider,
                balance: balanceData.balance,
                buying_power: balanceData.buying_power,
                equity: balanceData.equity,
                last_synced_at: new Date().toISOString(),
              }, {
                onConflict: "user_id,provider",
              });

            if (upsertError) {
              const { error: updateError } = await serviceClient
                .from("live_account")
                .update({
                  balance: balanceData.balance,
                  buying_power: balanceData.buying_power,
                  equity: balanceData.equity,
                  last_synced_at: new Date().toISOString(),
                })
                .eq("user_id", userId)
                .eq("provider", conn.provider);

              if (updateError) {
                console.error("Update error:", updateError);
              }
            }
            
            // Sync holdings to positions table
            if (balanceData.holdings.length > 0) {
              // First, delete existing live positions for this user to avoid duplicates
              await serviceClient
                .from("positions")
                .delete()
                .eq("user_id", userId)
                .eq("is_paper", false);
              
              // Insert current holdings as positions
              for (const holding of balanceData.holdings) {
                const { error: posError } = await serviceClient
                  .from("positions")
                  .insert({
                    user_id: userId,
                    symbol: holding.symbol,
                    side: "buy",
                    quantity: holding.quantity,
                    avg_entry_price: 0, // We don't know entry price from Coinbase
                    current_price: 0,
                    market_type: "crypto",
                    is_paper: false,
                    unrealized_pnl: 0,
                  });
                
                if (posError) {
                  console.error(`Error syncing position ${holding.symbol}:`, posError.message);
                } else {
                  console.log(`📊 Synced position: ${holding.quantity} ${holding.symbol}`);
                }
              }
            }
            
            allResults[userId] = { 
              provider: conn.provider, 
              balance: balanceData.balance,
              holdings: balanceData.holdings.length,
            };
          }
        } catch (err: any) {
          console.error(`Error syncing ${conn.provider} for ${userId}:`, err.message);
          allResults[userId] = { error: err.message };
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: usersToSync.length, 
        results: allResults 
      }),
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

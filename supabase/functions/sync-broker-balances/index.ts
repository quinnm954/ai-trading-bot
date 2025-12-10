import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Symbol mapping for CoinGecko API
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'XRP': 'ripple',
  'DOGE': 'dogecoin', 'ADA': 'cardano', 'AVAX': 'avalanche-2', 'DOT': 'polkadot',
  'LINK': 'chainlink', 'LTC': 'litecoin', 'UNI': 'uniswap', 'ATOM': 'cosmos',
  'NEAR': 'near', 'APT': 'aptos', 'ARB': 'arbitrum', 'OP': 'optimism',
  'INJ': 'injective-protocol', 'TIA': 'celestia', 'SEI': 'sei-network',
  'SUI': 'sui', 'TON': 'the-open-network', 'ICP': 'internet-computer',
  'FIL': 'filecoin', 'RENDER': 'render-token', 'FET': 'fetch-ai', 'TAO': 'bittensor',
  'AAVE': 'aave', 'MKR': 'maker', 'GRT': 'the-graph', 'LDO': 'lido-dao',
  'CRV': 'curve-dao-token', 'IMX': 'immutable-x', 'STX': 'blockstack',
  'HBAR': 'hedera-hashgraph', 'XLM': 'stellar', 'ALGO': 'algorand',
  'VET': 'vechain', 'ETC': 'ethereum-classic', 'BCH': 'bitcoin-cash', 'TRX': 'tron',
  'SHIB': 'shiba-inu', 'PEPE': 'pepe', 'FLOKI': 'floki', 'BONK': 'bonk', 'WIF': 'dogwifcoin',
  'GALA': 'gala', 'SAND': 'the-sandbox', 'MANA': 'decentraland', 'AXS': 'axie-infinity',
  'ENJ': 'enjincoin', 'CHZ': 'chiliz', 'APE': 'apecoin',
  'CAKE': 'pancakeswap-token', 'COMP': 'compound-governance-token', 'SNX': 'havven',
  'DYDX': 'dydx', 'GMX': 'gmx', '1INCH': '1inch', 'BAT': 'basic-attention-token',
  'ZRX': '0x', 'LRC': 'loopring', 'ENS': 'ethereum-name-service', 'RPL': 'rocket-pool',
  'BLUR': 'blur', 'JUP': 'jupiter-exchange-solana', 'ONDO': 'ondo-finance',
  'PYTH': 'pyth-network', 'WLD': 'worldcoin-wld', 'THETA': 'theta-token',
  'FTM': 'fantom', 'RUNE': 'thorchain', 'KAVA': 'kava',
  'EOS': 'eos', 'NEO': 'neo', 'XTZ': 'tezos', 'QTUM': 'qtum', 'ICX': 'icon',
  'ZIL': 'zilliqa', 'ONE': 'harmony', 'CELO': 'celo', 'ANKR': 'ankr',
  'SKL': 'skale', 'STORJ': 'storj', 'OCEAN': 'ocean-protocol', 'MINA': 'mina-protocol',
  'EGLD': 'elrond-erd-2', 'FLOW': 'flow', 'CFX': 'conflux-token', 'IOTA': 'iota',
  'KAS': 'kaspa', 'MNT': 'mantle', 'CRO': 'crypto-com-chain', 'OKB': 'okb',
  'MATIC': 'matic-network', 'POL': 'polygon-ecosystem-token',
};

// Fetch live prices from CoinGecko
async function fetchLivePrices(symbols: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  const ids = symbols
    .map(s => SYMBOL_TO_COINGECKO[s.toUpperCase()])
    .filter(Boolean);
  
  if (ids.length === 0) return prices;
  
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
    );
    
    if (response.ok) {
      const data = await response.json();
      for (const symbol of symbols) {
        const geckoId = SYMBOL_TO_COINGECKO[symbol.toUpperCase()];
        if (geckoId && data[geckoId]?.usd) {
          prices[symbol.toUpperCase()] = data[geckoId].usd;
        }
      }
    }
  } catch (error) {
    console.error('Error fetching prices:', error);
  }
  
  return prices;
}

// Generate JWT for Coinbase CDP API
async function generateCdpJwt(apiKey: string, privateKeyPem: string, uri: string): Promise<string> {
  console.log("Parsing private key...");
  
  let cleanKey = privateKeyPem.trim()
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  
  if (!cleanKey.includes("-----BEGIN")) {
    if (/^[A-Za-z0-9+/=\s]+$/.test(cleanKey.replace(/\s/g, ''))) {
      cleanKey = `-----BEGIN EC PRIVATE KEY-----\n${cleanKey}\n-----END EC PRIVATE KEY-----`;
    }
  }
  
  let privateKey: jose.KeyLike;
  
  const importMethods = [
    async () => {
      return await jose.importPKCS8(cleanKey, "ES256");
    },
    async () => {
      const pemContent = cleanKey
        .replace(/-----BEGIN.*-----/g, "")
        .replace(/-----END.*-----/g, "")
        .replace(/\s+/g, "");
      const reformatted = `-----BEGIN PRIVATE KEY-----\n${pemContent}\n-----END PRIVATE KEY-----`;
      return await jose.importPKCS8(reformatted, "ES256");
    },
    async () => {
      const pemContents = cleanKey
        .replace(/-----BEGIN.*-----/g, "")
        .replace(/-----END.*-----/g, "")
        .replace(/\s+/g, "");
      
      const binaryString = atob(pemContents);
      const keyBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        keyBytes[i] = binaryString.charCodeAt(i);
      }
      
      let dBytes: Uint8Array | null = null;
      
      for (let i = 0; i < keyBytes.length - 32; i++) {
        if (keyBytes[i] === 0x04 && keyBytes[i + 1] === 0x20) {
          dBytes = keyBytes.slice(i + 2, i + 34);
          break;
        }
      }
      
      if (!dBytes) {
        for (let i = 7; i < keyBytes.length - 32; i++) {
          if (keyBytes[i - 1] === 0x20 || keyBytes[i - 1] === 0x21) {
            const candidate = keyBytes.slice(i, i + 32);
            const unique = new Set(candidate);
            if (unique.size > 5) {
              dBytes = candidate;
              break;
            }
          }
        }
      }
      
      if (!dBytes) throw new Error("Could not extract private key bytes");
      
      const base64url = (bytes: Uint8Array) => 
        btoa(String.fromCharCode(...bytes))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');
      
      const jwk: jose.JWK = {
        kty: "EC",
        crv: "P-256",
        d: base64url(dBytes),
        x: base64url(new Uint8Array(32)),
        y: base64url(new Uint8Array(32)),
      };
      
      for (let i = 0; i < keyBytes.length - 65; i++) {
        if (keyBytes[i] === 0x04 && i + 65 <= keyBytes.length) {
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
  ];
  
  for (const method of importMethods) {
    try {
      privateKey = await method();
      
      return await new jose.SignJWT({ iss: "cdp", sub: apiKey, uri })
        .setProtectedHeader({ alg: "ES256", kid: apiKey, nonce: crypto.randomUUID(), typ: "JWT" })
        .setIssuedAt()
        .setNotBefore(Math.floor(Date.now() / 1000))
        .setExpirationTime("2m")
        .sign(privateKey);
    } catch {
      continue;
    }
  }
  
  throw new Error("All key import methods failed");
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

  let cashBalance = 0;
  const holdings: Array<{ symbol: string; quantity: number; value: number }> = [];
  const stablecoins = ["USD", "USDC", "USDT", "PYUSD", "USD1", "DAI", "BUSD", "GUSD", "USDP", "TUSD"];
  
  // Fetch accounts from Coinbase - the API returns all accounts in one response
  const requestPath = "/api/v3/brokerage/accounts";
  console.log(`📄 Fetching accounts from: ${requestPath}`);
  
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
  
  // Process accounts
  if (data.accounts && Array.isArray(data.accounts)) {
    console.log(`📊 Found ${data.accounts.length} accounts`);
    
    for (const account of data.accounts) {
      if (account.available_balance && account.available_balance.value) {
        const value = parseFloat(account.available_balance.value);
        const currency = account.currency || account.available_balance.currency;
        
        if (value > 0) {
          if (stablecoins.includes(currency)) {
            cashBalance += value;
            console.log(`💵 ${currency} balance: $${value.toFixed(2)}`);
          } else {
            holdings.push({
              symbol: currency,
              quantity: value,
              value: 0,
            });
            console.log(`📊 ${currency} holding: ${value}`);
          }
        }
      }
    }
  }

  console.log(`✅ Cash: $${cashBalance.toFixed(2)}, Holdings: ${holdings.length} assets`);

  // Fetch live prices to calculate total equity (cash + holdings value)
  let holdingsValue = 0;
  if (holdings.length > 0) {
    const holdingSymbols = holdings.map(h => h.symbol);
    const ids = holdingSymbols.map(s => SYMBOL_TO_COINGECKO[s.toUpperCase()]).filter(Boolean);
    
    if (ids.length > 0) {
      try {
        const priceResponse = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
        );
        
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          for (const holding of holdings) {
            const geckoId = SYMBOL_TO_COINGECKO[holding.symbol.toUpperCase()];
            if (geckoId && priceData[geckoId]?.usd) {
              const price = priceData[geckoId].usd;
              holding.value = holding.quantity * price;
              holdingsValue += holding.value;
            }
          }
        }
      } catch (error) {
        console.error('Error fetching prices for equity calculation:', error);
      }
    }
  }

  const totalEquity = cashBalance + holdingsValue;
  console.log(`💰 Total Equity: $${totalEquity.toFixed(2)} (Cash: $${cashBalance.toFixed(2)} + Holdings: $${holdingsValue.toFixed(2)})`);

  return {
    balance: cashBalance,
    buying_power: cashBalance,
    equity: totalEquity,
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
    
    const authHeader = req.headers.get("Authorization");
    const url = new URL(req.url);
    const isCron = url.searchParams.get("cron") === "true" || !authHeader;
    
    let usersToSync: string[] = [];
    
    if (isCron) {
      console.log("🔄 Cron job: Syncing all connected broker accounts");
      
      const { data: connections, error: connError } = await serviceClient
        .from("api_connections")
        .select("user_id")
        .eq("is_connected", true);
      
      if (connError) {
        throw new Error(`Failed to fetch connections: ${connError.message}`);
      }
      
      usersToSync = [...new Set(connections?.map(c => c.user_id).filter(Boolean) as string[])];
      console.log(`Found ${usersToSync.length} users to sync`);
    } else {
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
            
            // Sync holdings to positions table with accurate P&L
            // Filter out dust positions (below $1 value) to prevent clutter
            const DUST_THRESHOLD_USD = 1.0;
            
            if (balanceData.holdings.length > 0) {
              // Fetch live prices for P&L calculation
              const holdingSymbols = balanceData.holdings.map(h => h.symbol);
              const livePrices = await fetchLivePrices(holdingSymbols);
              
              // Filter out dust positions before processing
              const filteredHoldings = balanceData.holdings.filter(h => {
                const price = livePrices[h.symbol.toUpperCase()] || 0;
                const value = h.quantity * price;
                if (value < DUST_THRESHOLD_USD) {
                  console.log(`🧹 Skipping dust: ${h.symbol} = $${value.toFixed(4)}`);
                  return false;
                }
                return true;
              });
              
              console.log(`📊 Processing ${filteredHoldings.length} positions (filtered ${balanceData.holdings.length - filteredHoldings.length} dust)`);
              
              // If all positions are dust, clear the positions table
              if (filteredHoldings.length === 0) {
                await serviceClient
                  .from("positions")
                  .delete()
                  .eq("user_id", userId)
                  .eq("is_paper", false);
                console.log("🗑️ Cleared all live positions (all dust)");
                continue;
              }
              
              // Get current live positions with entry prices
              const { data: existingPositions } = await serviceClient
                .from("positions")
                .select("id, symbol, avg_entry_price, quantity")
                .eq("user_id", userId)
                .eq("is_paper", false);
              
              // Get trades to find actual entry prices (for positions with $0 or missing entry)
              const { data: userTrades } = await serviceClient
                .from("trades")
                .select("symbol, entry_price, quantity, created_at")
                .eq("user_id", userId)
                .eq("is_paper", false)
                .eq("status", "open")
                .order("created_at", { ascending: false });
              
              // Build a map of symbol -> best entry price from trades
              const tradeEntryPrices: Record<string, number> = {};
              if (userTrades) {
                for (const trade of userTrades) {
                  if (!tradeEntryPrices[trade.symbol] && trade.entry_price > 0) {
                    tradeEntryPrices[trade.symbol] = Number(trade.entry_price);
                  }
                }
              }
              
              const existingSymbols = new Set(existingPositions?.map(p => p.symbol) || []);
              const currentSymbols = new Set(filteredHoldings.map(h => h.symbol));
              
              // Delete positions that no longer exist in Coinbase
              const toDelete = existingPositions?.filter(p => !currentSymbols.has(p.symbol)) || [];
              for (const pos of toDelete) {
                await serviceClient.from("positions").delete().eq("id", pos.id);
                console.log(`🗑️ Removed position: ${pos.symbol}`);
              }
              
              // Upsert current holdings with accurate P&L
              for (const holding of filteredHoldings) {
                const currentPrice = livePrices[holding.symbol.toUpperCase()] || 0;
                
                if (existingSymbols.has(holding.symbol)) {
                  // Get existing position to check entry price
                  const existingPos = existingPositions?.find(p => p.symbol === holding.symbol);
                  let entryPrice = Number(existingPos?.avg_entry_price) || 0;
                  
                  // If entry price is 0 or missing, try to get it from trades
                  if (entryPrice <= 0 && tradeEntryPrices[holding.symbol]) {
                    entryPrice = tradeEntryPrices[holding.symbol];
                    console.log(`📝 Fixed entry price for ${holding.symbol}: $${entryPrice.toFixed(4)} (from trades)`);
                  }
                  
                  // Calculate accurate unrealized P&L
                  let unrealizedPnl = 0;
                  if (entryPrice > 0 && currentPrice > 0) {
                    unrealizedPnl = (currentPrice - entryPrice) * holding.quantity;
                  }
                  
                  // Update position - also update entry price if we fixed it
                  const updateData: Record<string, any> = { 
                    quantity: holding.quantity, 
                    current_price: currentPrice,
                    unrealized_pnl: unrealizedPnl,
                    updated_at: new Date().toISOString() 
                  };
                  
                  // Only update entry price if we have a better one
                  if (entryPrice > 0 && Number(existingPos?.avg_entry_price) <= 0) {
                    updateData.avg_entry_price = entryPrice;
                  }
                  
                  const { error: updateError } = await serviceClient
                    .from("positions")
                    .update(updateData)
                    .eq("user_id", userId)
                    .eq("symbol", holding.symbol)
                    .eq("is_paper", false);
                  
                  if (updateError) {
                    console.error(`Error updating ${holding.symbol}:`, updateError.message);
                  } else {
                    console.log(`📊 Updated: ${holding.quantity} ${holding.symbol} @ $${currentPrice.toFixed(4)}, entry: $${entryPrice.toFixed(4)}, PnL: $${unrealizedPnl.toFixed(4)}`);
                  }
                } else {
                  // New position - check trades for entry price first, else use current price as baseline
                  const entryPrice = tradeEntryPrices[holding.symbol] || currentPrice;
                  const unrealizedPnl = entryPrice > 0 && currentPrice > 0 
                    ? (currentPrice - entryPrice) * holding.quantity 
                    : 0;
                  
                  const { data: insertedData, error: posError } = await serviceClient
                    .from("positions")
                    .insert({
                      user_id: userId,
                      symbol: holding.symbol,
                      side: "buy",
                      quantity: holding.quantity,
                      avg_entry_price: entryPrice,
                      current_price: currentPrice,
                      market_type: "crypto",
                      is_paper: false,
                      unrealized_pnl: unrealizedPnl,
                    })
                    .select();
                  
                  if (posError) {
                    console.error(`❌ Error inserting ${holding.symbol}:`, posError.message);
                  } else {
                    console.log(`✅ Inserted: ${holding.quantity} ${holding.symbol} @ $${currentPrice.toFixed(4)}, entry: $${entryPrice.toFixed(4)}`);
                  }
                }
              }
            } else {
              await serviceClient
                .from("positions")
                .delete()
                .eq("user_id", userId)
                .eq("is_paper", false);
              console.log("🗑️ Cleared all live positions (no holdings)");
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

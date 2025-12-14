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
  
  // Fetch accounts from Coinbase
  const requestPath = "/api/v3/brokerage/accounts";
  console.log(`📄 Fetching accounts from: ${requestPath}`);
  
  let response: Response;

  if (isCdp) {
    const jwt = await generateCdpJwt(apiKey, apiSecret, `GET api.coinbase.com${requestPath}`);
    response = await fetch(`https://api.coinbase.com${requestPath}?limit=250`, {
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

    response = await fetch("https://api.coinbase.com" + requestPath + "?limit=250", {
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
  
  // Log pagination info
  console.log(`📊 Response has_next: ${data.has_next}, size: ${data.size}, cursor: ${data.cursor ? 'yes' : 'no'}`);
  
  // Process accounts - DETAILED LOGGING FOR DEBUG
  if (data.accounts && Array.isArray(data.accounts)) {
    console.log(`📊 Found ${data.accounts.length} total accounts from Coinbase`);
    
    // Log ALL currencies returned (even with 0 balance) to debug missing BTC
    console.log(`🔍 === ALL COINBASE ACCOUNTS ===`);
    const allCurrencies: string[] = [];
    
    // Check for BTC in ANY form
    let btcFound = false;
    let btcAccountData: any = null;
    
    for (const account of data.accounts) {
      const currency = account.currency || account.available_balance?.currency || 'UNKNOWN';
      const availableValue = parseFloat(account.available_balance?.value || '0');
      const holdValue = parseFloat(account.hold?.value || '0');
      const totalValue = availableValue + holdValue;
      const accountType = account.type || 'N/A';
      const accountName = account.name || 'N/A';
      const accountUuid = account.uuid || 'N/A';
      const accountActive = account.active;
      const accountReady = account.ready;
      
      allCurrencies.push(currency);
      
      // Check for ANY BTC-related currency
      if (currency === 'BTC' || currency === 'WBTC' || currency === 'cbBTC' || currency.includes('BTC')) {
        btcFound = true;
        btcAccountData = account;
        console.log(`🔶 BTC-RELATED FOUND: ${currency}`);
        console.log(`   available=${availableValue}, hold=${holdValue}, total=${totalValue}`);
        console.log(`   type=${accountType}, active=${accountActive}, ready=${accountReady}`);
        console.log(`   Full: ${JSON.stringify(account).substring(0, 800)}`);
      }
      
      // Log accounts with positive balance
      if (totalValue > 0) {
        console.log(`   ${currency}: available=${availableValue}, hold=${holdValue}, total=${totalValue}, type=${accountType}, name=${accountName}, uuid=${accountUuid.substring(0, 8)}...`);
      }
      
      // Process accounts with positive available balance
      if (account.available_balance && account.available_balance.value) {
        const value = parseFloat(account.available_balance.value);
        
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
    
    // Summary
    const sortedCurrencies = allCurrencies.filter((c, i, a) => a.indexOf(c) === i).sort();
    console.log(`🔍 All ${sortedCurrencies.length} currencies: ${sortedCurrencies.join(', ')}`);
    console.log(`🔍 BTC present in list: ${btcFound ? 'YES' : 'NO'}`);
    
    if (!btcFound) {
      console.log(`⚠️ BTC NOT FOUND in Coinbase brokerage API response!`);
      console.log(`   This could mean:`);
      console.log(`   1. BTC is in Coinbase Earn/Staking`);
      console.log(`   2. BTC is in a Vault`);
      console.log(`   3. BTC is in a different Coinbase portfolio`);
      console.log(`   4. API key doesn't have permission to view BTC`);
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

/**
 * Fetch Alpaca account balance and positions
 * PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
 */
async function fetchAlpacaBalanceAndHoldings(apiKey: string, secretKey: string): Promise<{
  balance: number;
  buying_power: number;
  equity: number;
  holdings: Array<{ symbol: string; quantity: number; value: number; entryPrice: number }>;
}> {
  // Determine if paper or live based on key prefix
  const isPaper = apiKey.startsWith("PK");
  const baseUrl = isPaper ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
  
  console.log(`📈 Fetching Alpaca ${isPaper ? 'paper' : 'live'} account...`);
  
  // Fetch account info
  const accountResponse = await fetch(`${baseUrl}/v2/account`, {
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": secretKey,
    },
  });
  
  if (!accountResponse.ok) {
    throw new Error(`Alpaca account error: ${accountResponse.status}`);
  }
  
  const account = await accountResponse.json();
  
  // Fetch positions
  const positionsResponse = await fetch(`${baseUrl}/v2/positions`, {
    headers: {
      "APCA-API-KEY-ID": apiKey,
      "APCA-API-SECRET-KEY": secretKey,
    },
  });
  
  const holdings: Array<{ symbol: string; quantity: number; value: number; entryPrice: number }> = [];
  
  if (positionsResponse.ok) {
    const positions = await positionsResponse.json();
    for (const pos of positions) {
      holdings.push({
        symbol: pos.symbol,
        quantity: parseFloat(pos.qty),
        value: parseFloat(pos.market_value),
        entryPrice: parseFloat(pos.avg_entry_price),
      });
    }
  }
  
  return {
    balance: parseFloat(account.cash || 0),
    buying_power: parseFloat(account.buying_power || 0),
    equity: parseFloat(account.equity || 0),
    holdings,
  };
}

/**
 * Fetch Tradier account balance and positions
 * PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
 */
async function fetchTradierBalanceAndHoldings(accessToken: string): Promise<{
  balance: number;
  buying_power: number;
  equity: number;
  holdings: Array<{ symbol: string; quantity: number; value: number; entryPrice: number }>;
}> {
  console.log(`📈 Fetching Tradier account...`);
  
  // Get accounts list
  const accountsResponse = await fetch("https://api.tradier.com/v1/accounts", {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    },
  });
  
  if (!accountsResponse.ok) {
    throw new Error(`Tradier accounts error: ${accountsResponse.status}`);
  }
  
  const accountsData = await accountsResponse.json();
  const accounts = accountsData?.accounts?.account;
  const account = Array.isArray(accounts) ? accounts[0] : accounts;
  
  if (!account) {
    throw new Error("No Tradier account found");
  }
  
  const accountId = account.account_number;
  
  // Get account balances
  const balanceResponse = await fetch(`https://api.tradier.com/v1/accounts/${accountId}/balances`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    },
  });
  
  let balance = 0;
  let buyingPower = 0;
  let equity = 0;
  
  if (balanceResponse.ok) {
    const balanceData = await balanceResponse.json();
    const bal = balanceData?.balances;
    balance = parseFloat(bal?.total_cash || bal?.cash?.cash_available || 0);
    buyingPower = parseFloat(bal?.margin?.stock_buying_power || bal?.cash?.cash_available || 0);
    equity = parseFloat(bal?.total_equity || bal?.market_value || 0);
  }
  
  // Get positions
  const positionsResponse = await fetch(`https://api.tradier.com/v1/accounts/${accountId}/positions`, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json",
    },
  });
  
  const holdings: Array<{ symbol: string; quantity: number; value: number; entryPrice: number }> = [];
  
  if (positionsResponse.ok) {
    const positionsData = await positionsResponse.json();
    const positions = positionsData?.positions?.position;
    
    if (positions) {
      const posArray = Array.isArray(positions) ? positions : [positions];
      for (const pos of posArray) {
        const qty = parseFloat(pos.quantity);
        const costBasis = parseFloat(pos.cost_basis || 0);
        holdings.push({
          symbol: pos.symbol,
          quantity: qty,
          value: costBasis,
          entryPrice: qty > 0 ? costBasis / qty : 0,
        });
      }
    }
  }
  
  return { balance, buying_power: buyingPower, equity, holdings };
}

/**
 * Get user's broker credentials from the database
 * PATENT REFERENCE: No Custody of User Funds (Patent Claim 5)
 */
async function getUserBrokerCredentials(
  serviceClient: any, 
  userId: string, 
  provider: string
): Promise<{ apiKey: string; secretKey: string; accessToken?: string; isPaper: boolean } | null> {
  const { data, error } = await serviceClient
    .from('broker_credentials')
    .select('api_key_encrypted, secret_key_encrypted, access_token_encrypted, is_paper')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();
  
  if (error || !data) {
    console.log(`No credentials found for ${provider} user ${userId}`);
    return null;
  }
  
  return {
    apiKey: data.api_key_encrypted,
    secretKey: data.secret_key_encrypted || '',
    accessToken: data.access_token_encrypted || undefined,
    isPaper: data.is_paper,
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
          
          // CRYPTO: Coinbase sync (uses global secrets)
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
          
          // STOCKS: Alpaca sync - reads credentials from broker_credentials table
          else if (conn.provider === "alpaca") {
            const creds = await getUserBrokerCredentials(serviceClient, userId, 'alpaca');
            if (!creds) {
              console.log(`⚠️ No Alpaca credentials found for user ${userId}`);
              allResults[userId] = { provider: conn.provider, error: "No credentials stored" };
              continue;
            }
            
            try {
              const balanceData = await fetchAlpacaBalanceAndHoldings(creds.apiKey, creds.secretKey);
              
              console.log(`✅ Alpaca synced: $${balanceData.balance.toFixed(2)} cash, ${balanceData.holdings.length} holdings`);
              
              // Update live_account
              await serviceClient
                .from("live_account")
                .upsert({
                  user_id: userId,
                  provider: conn.provider,
                  balance: balanceData.balance,
                  buying_power: balanceData.buying_power,
                  equity: balanceData.equity,
                  last_synced_at: new Date().toISOString(),
                }, { onConflict: "user_id,provider" });
              
              // Sync positions
              for (const holding of balanceData.holdings) {
                await serviceClient
                  .from("positions")
                  .upsert({
                    user_id: userId,
                    symbol: holding.symbol,
                    side: "buy",
                    quantity: holding.quantity,
                    avg_entry_price: holding.entryPrice,
                    current_price: holding.value / holding.quantity,
                    market_type: "stocks",
                    is_paper: creds.isPaper,
                    unrealized_pnl: holding.value - (holding.entryPrice * holding.quantity),
                  }, { onConflict: "user_id,symbol,is_paper" });
              }
              
              allResults[userId] = { 
                provider: conn.provider, 
                balance: balanceData.balance,
                holdings: balanceData.holdings.length,
              };
            } catch (err: any) {
              console.error(`Alpaca sync failed: ${err.message}`);
              allResults[userId] = { provider: conn.provider, error: err.message };
            }
          }
          
          // STOCKS: Tradier sync
          else if (conn.provider === "tradier") {
            const creds = await getUserBrokerCredentials(serviceClient, userId, 'tradier');
            if (!creds) {
              console.log(`⚠️ No Tradier credentials found for user ${userId}`);
              allResults[userId] = { provider: conn.provider, error: "No credentials stored" };
              continue;
            }
            
            try {
              const balanceData = await fetchTradierBalanceAndHoldings(creds.accessToken || creds.apiKey);
              
              console.log(`✅ Tradier synced: $${balanceData.balance.toFixed(2)} cash, ${balanceData.holdings.length} holdings`);
              
              // Update live_account
              await serviceClient
                .from("live_account")
                .upsert({
                  user_id: userId,
                  provider: conn.provider,
                  balance: balanceData.balance,
                  buying_power: balanceData.buying_power,
                  equity: balanceData.equity,
                  last_synced_at: new Date().toISOString(),
                }, { onConflict: "user_id,provider" });
              
              // Sync positions
              for (const holding of balanceData.holdings) {
                await serviceClient
                  .from("positions")
                  .upsert({
                    user_id: userId,
                    symbol: holding.symbol,
                    side: "buy",
                    quantity: holding.quantity,
                    avg_entry_price: holding.entryPrice,
                    current_price: holding.value / holding.quantity,
                    market_type: "stocks",
                    is_paper: false,
                    unrealized_pnl: holding.value - (holding.entryPrice * holding.quantity),
                  }, { onConflict: "user_id,symbol,is_paper" });
              }
              
              allResults[userId] = { 
                provider: conn.provider, 
                balance: balanceData.balance,
                holdings: balanceData.holdings.length,
              };
            } catch (err: any) {
              console.error(`Tradier sync failed: ${err.message}`);
              allResults[userId] = { provider: conn.provider, error: err.message };
            }
          }
          
          // STOCKS: Interactive Brokers sync
          else if (conn.provider === "ibkr") {
            console.log(`⚠️ IBKR sync requires OAuth flow (not yet implemented)`);
            allResults[userId] = { 
              provider: conn.provider, 
              message: "IBKR requires OAuth authentication flow",
            };
          }
          
          // Other crypto exchanges (binance, kraken, etc.)
          else {
            console.log(`⚠️ ${conn.provider} sync not yet implemented`);
            allResults[userId] = { 
              provider: conn.provider, 
              message: `${conn.provider} sync coming soon`,
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

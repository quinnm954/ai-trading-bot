import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

/**
 * =============================================================================
 * BROKER CONNECTION TEST - Multi-Asset Authentication Service
 * =============================================================================
 * 
 * PATENT REFERENCE: Multi-Asset Class Trading (Patent Claim 1)
 * PATENT REFERENCE: No Custody of User Funds (Patent Claim 5)
 * 
 * This edge function validates crypto exchange API credentials
 * crypto exchanges, enabling the patent's multi-asset trading capability.
 * 
 * SUPPORTED BROKERS/EXCHANGES:
 * - Coinbase: Cryptocurrency
 * - Binance, Kraken, KuCoin, Bybit, OKX, Gate.io, Bitget: Crypto
 * 
 * =============================================================================
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Exchange configurations with key detection patterns
const EXCHANGES = {
  // CRYPTO EXCHANGES
  coinbase: {
    name: "Coinbase",
    assetClasses: ["crypto"],
    keyPatterns: [
      { pattern: /^organizations\//, type: "cdp" },
      { pattern: /-----BEGIN.*PRIVATE KEY-----/, field: "secret", type: "cdp" },
    ],
    endpoints: {
      accounts: "https://api.coinbase.com/api/v3/brokerage/accounts",
    },
  },
  binance: {
    name: "Binance",
    assetClasses: ["crypto"],
    keyPatterns: [
      { pattern: /^[A-Za-z0-9]{64}$/, type: "hmac" },
    ],
    endpoints: {
      accounts: "https://api.binance.com/api/v3/account",
    },
  },
  kraken: {
    name: "Kraken",
    assetClasses: ["crypto"],
    keyPatterns: [
      { pattern: /^[A-Za-z0-9+/=]{56}$/, type: "hmac" },
    ],
    endpoints: {
      accounts: "https://api.kraken.com/0/private/Balance",
    },
  },
  kucoin: {
    name: "KuCoin",
    assetClasses: ["crypto"],
    keyPatterns: [
      { pattern: /^[a-f0-9]{24}$/, type: "hmac" },
    ],
    endpoints: {
      accounts: "https://api.kucoin.com/api/v1/accounts",
    },
  },
  bybit: {
    name: "Bybit",
    assetClasses: ["crypto"],
    keyPatterns: [
      { pattern: /^[A-Za-z0-9]{18}$/, type: "hmac" },
    ],
    endpoints: {
      accounts: "https://api.bybit.com/v5/account/wallet-balance",
    },
  },
  okx: {
    name: "OKX",
    assetClasses: ["crypto"],
    keyPatterns: [
      { pattern: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, type: "hmac" },
    ],
    endpoints: {
      accounts: "https://www.okx.com/api/v5/account/balance",
    },
  },
  gateio: {
    name: "Gate.io",
    assetClasses: ["crypto"],
    keyPatterns: [
      { pattern: /^[a-f0-9]{32}$/, type: "hmac" },
    ],
    endpoints: {
      accounts: "https://api.gateio.ws/api/v4/spot/accounts",
    },
  },
  bitget: {
    name: "Bitget",
    assetClasses: ["crypto"],
    keyPatterns: [
      { pattern: /^bg_[a-f0-9]{32}$/, type: "hmac" },
    ],
    endpoints: {
      accounts: "https://api.bitget.com/api/spot/v1/account/assets",
    },
  },
};

type ExchangeType = keyof typeof EXCHANGES;

interface ExchangeCredentials {
  provider?: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
}

interface DetectionResult {
  exchange: ExchangeType;
  authType: string;
  confidence: number;
}

// Auto-detect exchange from API key format
function detectExchange(apiKey: string, secretKey: string): DetectionResult | null {
  console.log("Detecting exchange from key format...");
  
  
  // CRYPTO EXCHANGE DETECTION
  // Check for Coinbase CDP (most distinctive)
  if (apiKey.startsWith("organizations/") || 
      secretKey.includes("-----BEGIN") || 
      secretKey.includes("PRIVATE KEY")) {
    console.log("Detected: Coinbase CDP");
    return { exchange: "coinbase", authType: "cdp", confidence: 1.0 };
  }
  
  // Check Bitget (has distinctive prefix)
  if (apiKey.startsWith("bg_")) {
    console.log("Detected: Bitget");
    return { exchange: "bitget", authType: "hmac", confidence: 0.95 };
  }
  
  // Check OKX (UUID format)
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(apiKey)) {
    console.log("Detected: OKX");
    return { exchange: "okx", authType: "hmac", confidence: 0.9 };
  }
  
  // Check Binance (64 char alphanumeric)
  if (/^[A-Za-z0-9]{64}$/.test(apiKey)) {
    console.log("Detected: Binance");
    return { exchange: "binance", authType: "hmac", confidence: 0.85 };
  }
  
  // Check Kraken (56 char base64-ish)
  if (/^[A-Za-z0-9+/=]{50,60}$/.test(apiKey)) {
    console.log("Detected: Kraken");
    return { exchange: "kraken", authType: "hmac", confidence: 0.7 };
  }
  
  // Check KuCoin (24 char hex)
  if (/^[a-f0-9]{24}$/i.test(apiKey)) {
    console.log("Detected: KuCoin");
    return { exchange: "kucoin", authType: "hmac", confidence: 0.8 };
  }
  
  // Check Bybit (18 char alphanumeric)
  if (/^[A-Za-z0-9]{18}$/.test(apiKey)) {
    console.log("Detected: Bybit");
    return { exchange: "bybit", authType: "hmac", confidence: 0.75 };
  }
  
  // Check Gate.io (32 char hex)
  if (/^[a-f0-9]{32}$/i.test(apiKey) && /^[a-f0-9]{64}$/i.test(secretKey)) {
    console.log("Detected: Gate.io");
    return { exchange: "gateio", authType: "hmac", confidence: 0.7 };
  }
  
  // Default to Coinbase legacy if nothing else matches
  console.log("No specific pattern matched, trying Coinbase legacy");
  return { exchange: "coinbase", authType: "legacy", confidence: 0.3 };
}

// Alpaca integration removed.


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

// Test Coinbase connection
async function testCoinbase(apiKey: string, secretKey: string, passphrase?: string, authType?: string) {
  const isCdp = authType === "cdp" || apiKey.startsWith("organizations/") || secretKey.includes("-----BEGIN");
  
  if (isCdp) {
    const requestPath = "/api/v3/brokerage/accounts";
    const jwt = await generateCdpJwt(apiKey, secretKey, `GET api.coinbase.com${requestPath}`);
    
    const response = await fetch(`https://api.coinbase.com${requestPath}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json" },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Coinbase CDP error (${response.status}): ${errorText}`);
    }
    
    const data = await response.json();
    let totalBalance = 0;
    if (data.accounts) {
      for (const acc of data.accounts) {
        if (acc.available_balance?.value) totalBalance += parseFloat(acc.available_balance.value);
      }
    }
    
    return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
  }
  
  // Legacy API
  if (!passphrase) throw new Error("Passphrase required for Coinbase legacy API");
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const requestPath = "/api/v3/brokerage/accounts";
  const message = timestamp + "GET" + requestPath;
  
  const decodedSecret = Uint8Array.from(atob(secretKey), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("raw", decodedSecret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch("https://api.coinbase.com" + requestPath, {
    method: "GET",
    headers: {
      "CB-ACCESS-KEY": apiKey,
      "CB-ACCESS-SIGN": signatureBase64,
      "CB-ACCESS-TIMESTAMP": timestamp,
      "CB-ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    },
  });
  
  if (!response.ok) throw new Error(`Coinbase error: ${await response.text()}`);
  
  const data = await response.json();
  let totalBalance = 0;
  if (data.accounts) {
    for (const acc of data.accounts) {
      if (acc.available_balance?.value) totalBalance += parseFloat(acc.available_balance.value);
    }
  }
  
  return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
}

// Test Binance connection
async function testBinance(apiKey: string, secretKey: string) {
  const timestamp = Date.now();
  const queryString = `timestamp=${timestamp}`;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(queryString));
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const response = await fetch(`https://api.binance.com/api/v3/account?${queryString}&signature=${signatureHex}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  
  if (!response.ok) throw new Error(`Binance error: ${await response.text()}`);
  
  const data = await response.json();
  let totalBalance = 0;
  if (data.balances) {
    for (const bal of data.balances) {
      const free = parseFloat(bal.free || 0);
      const locked = parseFloat(bal.locked || 0);
      // For simplicity, just count non-zero balances
      if (free + locked > 0) totalBalance += free + locked;
    }
  }
  
  return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
}

// Test Kraken connection
async function testKraken(apiKey: string, secretKey: string) {
  const nonce = Date.now() * 1000;
  const postData = `nonce=${nonce}`;
  const path = "/0/private/Balance";
  
  const sha256 = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce + postData));
  const message = new Uint8Array([...new TextEncoder().encode(path), ...new Uint8Array(sha256)]);
  
  const decodedSecret = Uint8Array.from(atob(secretKey), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", decodedSecret, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch("https://api.kraken.com" + path, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": signatureBase64,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
  });
  
  if (!response.ok) throw new Error(`Kraken error: ${await response.text()}`);
  
  const data = await response.json();
  if (data.error && data.error.length > 0) throw new Error(`Kraken: ${data.error.join(", ")}`);
  
  let totalBalance = 0;
  if (data.result) {
    for (const [, value] of Object.entries(data.result)) {
      totalBalance += parseFloat(value as string || "0");
    }
  }
  
  return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
}

// Test KuCoin connection
async function testKucoin(apiKey: string, secretKey: string, passphrase?: string) {
  if (!passphrase) throw new Error("Passphrase required for KuCoin");
  
  const timestamp = Date.now().toString();
  const path = "/api/v1/accounts";
  const strToSign = timestamp + "GET" + path;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(strToSign));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  // Encrypt passphrase
  const passphraseKey = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const passphraseSign = await crypto.subtle.sign("HMAC", passphraseKey, encoder.encode(passphrase));
  const passphraseBase64 = btoa(String.fromCharCode(...new Uint8Array(passphraseSign)));
  
  const response = await fetch("https://api.kucoin.com" + path, {
    headers: {
      "KC-API-KEY": apiKey,
      "KC-API-SIGN": signatureBase64,
      "KC-API-TIMESTAMP": timestamp,
      "KC-API-PASSPHRASE": passphraseBase64,
      "KC-API-KEY-VERSION": "2",
    },
  });
  
  if (!response.ok) throw new Error(`KuCoin error: ${await response.text()}`);
  
  const data = await response.json();
  let totalBalance = 0;
  if (data.data) {
    for (const acc of data.data) {
      totalBalance += parseFloat(acc.balance || 0);
    }
  }
  
  return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
}

// Test Bybit connection
async function testBybit(apiKey: string, secretKey: string) {
  const timestamp = Date.now().toString();
  const recvWindow = "5000";
  const params = `accountType=UNIFIED`;
  const paramStr = `${timestamp}${apiKey}${recvWindow}${params}`;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(paramStr));
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const response = await fetch(`https://api.bybit.com/v5/account/wallet-balance?${params}`, {
    headers: {
      "X-BAPI-API-KEY": apiKey,
      "X-BAPI-SIGN": signatureHex,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
  });
  
  if (!response.ok) throw new Error(`Bybit error: ${await response.text()}`);
  
  const data = await response.json();
  if (data.retCode !== 0) throw new Error(`Bybit: ${data.retMsg}`);
  
  let totalBalance = 0;
  if (data.result?.list) {
    for (const account of data.result.list) {
      totalBalance += parseFloat(account.totalEquity || 0);
    }
  }
  
  return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
}

// Test OKX connection
async function testOkx(apiKey: string, secretKey: string, passphrase?: string) {
  if (!passphrase) throw new Error("Passphrase required for OKX");
  
  const timestamp = new Date().toISOString();
  const method = "GET";
  const requestPath = "/api/v5/account/balance";
  const preHash = timestamp + method + requestPath;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(preHash));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch("https://www.okx.com" + requestPath, {
    headers: {
      "OK-ACCESS-KEY": apiKey,
      "OK-ACCESS-SIGN": signatureBase64,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": passphrase,
    },
  });
  
  if (!response.ok) throw new Error(`OKX error: ${await response.text()}`);
  
  const data = await response.json();
  if (data.code !== "0") throw new Error(`OKX: ${data.msg}`);
  
  let totalBalance = 0;
  if (data.data?.[0]?.details) {
    for (const detail of data.data[0].details) {
      totalBalance += parseFloat(detail.eq || 0);
    }
  }
  
  return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
}

// Test Gate.io connection
async function testGateio(apiKey: string, secretKey: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const path = "/api/v4/spot/accounts";
  const queryString = "";
  const bodyHash = await crypto.subtle.digest("SHA-512", new TextEncoder().encode(""));
  const bodyHashHex = Array.from(new Uint8Array(bodyHash)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const signString = `${method}\n${path}\n${queryString}\n${bodyHashHex}\n${timestamp}`;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signString));
  const signatureHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const response = await fetch("https://api.gateio.ws" + path, {
    headers: {
      "KEY": apiKey,
      "SIGN": signatureHex,
      "Timestamp": timestamp,
    },
  });
  
  if (!response.ok) throw new Error(`Gate.io error: ${await response.text()}`);
  
  const data = await response.json();
  let totalBalance = 0;
  if (Array.isArray(data)) {
    for (const acc of data) {
      totalBalance += parseFloat(acc.available || 0) + parseFloat(acc.locked || 0);
    }
  }
  
  return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
}

// Test Bitget connection
async function testBitget(apiKey: string, secretKey: string, passphrase?: string) {
  if (!passphrase) throw new Error("Passphrase required for Bitget");
  
  const timestamp = Date.now().toString();
  const method = "GET";
  const path = "/api/spot/v1/account/assets";
  const preHash = timestamp + method + path;
  
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secretKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(preHash));
  const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  
  const response = await fetch("https://api.bitget.com" + path, {
    headers: {
      "ACCESS-KEY": apiKey,
      "ACCESS-SIGN": signatureBase64,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": passphrase,
    },
  });
  
  if (!response.ok) throw new Error(`Bitget error: ${await response.text()}`);
  
  const data = await response.json();
  if (data.code !== "00000") throw new Error(`Bitget: ${data.msg}`);
  
  let totalBalance = 0;
  if (data.data) {
    for (const asset of data.data) {
      totalBalance += parseFloat(asset.available || 0);
    }
  }
  
  return { balance: totalBalance, buying_power: totalBalance, equity: totalBalance };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body: ExchangeCredentials = await req.json();
    const { provider, apiKey, secretKey, passphrase } = body;

    if (!apiKey || !secretKey) throw new Error("Missing required credentials");

    // Auto-detect exchange if not specified
    let detectedExchange = provider as ExchangeType | undefined;
    let authType: string | undefined;
    
    if (!detectedExchange || detectedExchange === "auto" as any) {
      const detection = detectExchange(apiKey, secretKey);
      if (!detection) throw new Error("Could not detect exchange from API key format");
      detectedExchange = detection.exchange;
      authType = detection.authType;
      console.log(`Auto-detected exchange: ${detectedExchange} (${authType}) with confidence ${detection.confidence}`);
    }

    let accountInfo;
    
    switch (detectedExchange) {
      case "coinbase":
        accountInfo = await testCoinbase(apiKey, secretKey, passphrase, authType);
        break;
      case "binance":
        accountInfo = await testBinance(apiKey, secretKey);
        break;
      case "kraken":
        accountInfo = await testKraken(apiKey, secretKey);
        break;
      case "kucoin":
        accountInfo = await testKucoin(apiKey, secretKey, passphrase);
        break;
      case "bybit":
        accountInfo = await testBybit(apiKey, secretKey);
        break;
      case "okx":
        accountInfo = await testOkx(apiKey, secretKey, passphrase);
        break;
      case "gateio":
        accountInfo = await testGateio(apiKey, secretKey);
        break;
      case "bitget":
        accountInfo = await testBitget(apiKey, secretKey, passphrase);
        break;
      default:
        throw new Error(`Unsupported exchange: ${detectedExchange}`);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      detectedExchange,
      exchangeName: EXCHANGES[detectedExchange].name,
      accountInfo 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error testing connection:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Failed to test connection" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

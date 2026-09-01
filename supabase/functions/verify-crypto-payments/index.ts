import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import {
  CHAINS,
  getBlockNumber,
  getIncomingTransfers,
  toBaseUnits,
  fromBaseUnits,
  isValidEvmAddress,
  type ChainConfig,
} from "../_shared/crypto-chain.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** RPC providers cap eth_getLogs ranges; stay well inside the limit. */
const BLOCK_CHUNK = 2000;
const MAX_CHUNKS_PER_RUN = 12;
/** How far back to look on a cold start (also the re-scan safety overlap). */
const COLD_START_HOURS = 2;
const OVERLAP_BLOCKS = 60;

const logStep = (step: string, details?: unknown) => {
  console.log(`[VERIFY-CRYPTO] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

interface PendingInvoice {
  id: string;
  user_id: string;
  amount_usdc: string;
}

/** Scans a chain for incoming USDC and credits any invoice whose exact amount matches. */
async function scanChain(
  supabase: ReturnType<typeof createClient>,
  chain: ChainConfig,
  chainKey: string,
  recipient: string,
): Promise<{ scannedTo: number; matched: number; transfersSeen: number }> {
  const head = await getBlockNumber(chain);

  const { data: scanState } = await supabase
    .from("crypto_scan_state")
    .select("last_scanned_block")
    .eq("chain", chainKey)
    .maybeSingle();

  const stored = Number(scanState?.last_scanned_block ?? 0);
  const coldStart = Math.max(0, head - chain.blocksPerHour * COLD_START_HOURS);
  // Re-scan a small overlap so a reorg or boundary block is never dropped
  let fromBlock = stored > 0 ? Math.max(coldStart, stored - OVERLAP_BLOCKS) : coldStart;

  let matched = 0;
  let transfersSeen = 0;
  let scannedTo = fromBlock;

  for (let chunk = 0; chunk < MAX_CHUNKS_PER_RUN && fromBlock <= head; chunk++) {
    const toBlock = Math.min(fromBlock + BLOCK_CHUNK - 1, head);
    const transfers = await getIncomingTransfers(chain, recipient, fromBlock, toBlock);
    transfersSeen += transfers.length;

    if (transfers.length > 0) {
      logStep("Transfers found", { fromBlock, toBlock, count: transfers.length });

      // Pending invoices are matched by exact amount, which is unique per invoice
      const { data: pending } = await supabase
        .from("crypto_invoices")
        .select("id, user_id, amount_usdc")
        .eq("chain", chainKey)
        .eq("status", "pending");

      const byAmount = new Map<string, PendingInvoice>();
      for (const inv of (pending || []) as PendingInvoice[]) {
        byAmount.set(toBaseUnits(String(inv.amount_usdc), chain.usdcDecimals).toString(), inv);
      }

      for (const transfer of transfers) {
        const invoice = byAmount.get(transfer.value.toString());
        if (!invoice) {
          logStep("Unmatched transfer", {
            txHash: transfer.txHash,
            amount: fromBaseUnits(transfer.value, chain.usdcDecimals),
          });
          continue;
        }

        const { data: result, error } = await supabase.rpc("credit_crypto_invoice", {
          p_invoice_id: invoice.id,
          p_tx_hash: transfer.txHash,
          p_from_address: transfer.from,
          p_block_number: transfer.blockNumber,
        });

        if (error) {
          console.error(`Failed to credit invoice ${invoice.id}: ${error.message}`);
          continue;
        }

        byAmount.delete(transfer.value.toString());
        matched++;
        logStep("Invoice credited", { invoiceId: invoice.id, txHash: transfer.txHash, result });
      }
    }

    scannedTo = toBlock;
    fromBlock = toBlock + 1;
  }

  await supabase
    .from("crypto_scan_state")
    .upsert({
      chain: chainKey,
      last_scanned_block: scannedTo,
      updated_at: new Date().toISOString(),
    }, { onConflict: "chain" });

  return { scannedTo, matched, transfersSeen };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Anyone signed in may trigger a scan (they're waiting on their own payment).
    // Cron calls arrive without a user token and are allowed too.
    const authHeader = req.headers.get("Authorization");
    let callerId: string | null = null;
    if (authHeader) {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      callerId = data.user?.id ?? null;
    }

    await supabase.rpc("expire_stale_crypto_invoices");

    const { data: config } = await supabase
      .from("crypto_payment_config")
      .select("*")
      .eq("id", true)
      .maybeSingle();

    if (!config?.enabled || !config.wallet_address || !isValidEvmAddress(config.wallet_address)) {
      return new Response(
        JSON.stringify({ scanned: false, reason: "Crypto payments not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    const chainKey = config.chain as string;
    const chain = CHAINS[chainKey];
    if (!chain) throw new Error(`Unsupported chain: ${chainKey}`);

    const result = await scanChain(supabase, chain, chainKey, config.wallet_address);
    logStep("Scan complete", result);

    // Let the caller know whether their own payment landed
    let callerInvoice: unknown = null;
    if (callerId) {
      const { data } = await supabase
        .from("crypto_invoices")
        .select("id, status, tx_hash, amount_usdc, confirmed_at, expires_at")
        .eq("user_id", callerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      callerInvoice = data;
    }

    return new Response(JSON.stringify({
      scanned: true,
      chain: chainKey,
      last_scanned_block: result.scannedTo,
      transfers_seen: result.transfersSeen,
      invoices_credited: result.matched,
      invoice: callerInvoice,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

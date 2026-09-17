// Loads a user's Alpaca credentials from broker_credentials, the same way the
// Coinbase path does. Keys stay user-owned; the app never holds house keys.

import type { AlpacaCreds } from './alpaca.ts';

// deno-lint-ignore no-explicit-any
export async function loadAlpacaCreds(supabase: any, userId: string): Promise<AlpacaCreds | null> {
  const { data, error } = await supabase
    .from('broker_credentials')
    .select('api_key_encrypted, secret_key_encrypted, is_paper')
    .eq('user_id', userId)
    .eq('provider', 'alpaca')
    .maybeSingle();

  if (error || !data?.api_key_encrypted || !data?.secret_key_encrypted) return null;

  return {
    keyId: String(data.api_key_encrypted),
    secretKey: String(data.secret_key_encrypted),
    paper: data.is_paper !== false,
  };
}

/**
 * Falls back to project-level keys when a user has not connected their own.
 * Used only for market DATA (quotes/bars/calendar), never for placing orders.
 */
export function envAlpacaCreds(): AlpacaCreds | null {
  const keyId = Deno.env.get('ALPACA_API_KEY_ID');
  const secretKey = Deno.env.get('ALPACA_API_SECRET_KEY');
  if (!keyId || !secretKey) return null;
  return { keyId, secretKey, paper: true };
}

/** Order-capable creds (user only) vs data-capable creds (user, else project). */
// deno-lint-ignore no-explicit-any
export async function loadDataCreds(supabase: any, userId: string): Promise<AlpacaCreds | null> {
  return (await loadAlpacaCreds(supabase, userId)) ?? envAlpacaCreds();
}

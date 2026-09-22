/**
 * Copy-trading mode detection.
 *
 * When an account has copy trading switched on AND is actively following at
 * least one trader, the account is in COPY-ONLY mode:
 *   - the AI engine must not open any of its own buys
 *   - copied buys bypass our own risk parameters entirely
 *
 * Exits of copied positions are driven by the trader's own sell signals.
 */
export async function isCopyOnlyMode(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data: cfg } = await supabase
      .from('copy_trading_settings')
      .select('enabled, auto_copy')
      .eq('user_id', userId)
      .maybeSingle();

    // No row = copy trading was never switched on for this account.
    if (!cfg) return false;
    if (cfg.enabled === false || cfg.auto_copy === false) return false;

    const { count } = await supabase
      .from('followed_traders')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true);

    return (count ?? 0) > 0;
  } catch {
    // Unknown state: behave normally rather than silently freezing the engine.
    return false;
  }
}

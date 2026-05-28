import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Rocket, AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "@/hooks/use-toast";

/**
 * One-click "Aggressive Growth Mode" preset.
 *
 * Flips a coordinated set of risk + scalp settings designed to push for
 * higher returns. NOT a guarantee — variance and drawdown go up too.
 *
 * ON:
 *   ai_settings.risk_tolerance        = 'ultra_aggressive'
 *   ai_settings.prioritize_moonshots  = true
 *   ai_settings.max_position_size     = 15
 *   ai_settings.max_concurrent_trades = 10
 *   ai_settings.max_daily_loss        = 8
 *   scalp_settings.take_profit_pct    = 2.5
 *   scalp_settings.entry_min_5m/15m/1h/24h_pct = looser
 *   scalp_settings.max_concurrent_positions    = 18
 *   scalp_settings.target_position_size_usd    = 250
 *
 * OFF (safe defaults restored):
 *   risk_tolerance = 'moderate', moonshots off, conservative caps.
 */

const AGGRESSIVE_AI = {
  risk_tolerance: "ultra_aggressive",
  prioritize_moonshots: true,
  max_position_size: 15,
  max_concurrent_trades: 10,
  max_daily_loss: 8,
};
const AGGRESSIVE_SCALP = {
  take_profit_pct: 2.5,
  entry_min_5m_pct: 0.15,
  entry_min_15m_pct: 0.1,
  entry_min_1h_pct: 0.15,
  entry_min_24h_pct: 0.15,
  max_concurrent_positions: 18,
  target_position_size_usd: 250,
};

const SAFE_AI = {
  risk_tolerance: "moderate",
  prioritize_moonshots: false,
  max_position_size: 10,
  max_concurrent_trades: 5,
  max_daily_loss: 3,
};
const SAFE_SCALP = {
  take_profit_pct: 1.0,
  entry_min_5m_pct: 0.3,
  entry_min_15m_pct: 0.2,
  entry_min_1h_pct: 0.3,
  entry_min_24h_pct: 0.3,
  max_concurrent_positions: 12,
  target_position_size_usd: 50,
};

export function AggressiveGrowthModeCard() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("ai_settings")
      .select("risk_tolerance, prioritize_moonshots")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setEnabled(
          data?.risk_tolerance === "ultra_aggressive" && !!data?.prioritize_moonshots,
        );
      });
  }, [user]);

  const apply = async (turnOn: boolean) => {
    if (!user) return;
    setSaving(true);
    try {
      const ai = turnOn ? AGGRESSIVE_AI : SAFE_AI;
      const scalp = turnOn ? AGGRESSIVE_SCALP : SAFE_SCALP;

      const [aiRes, scalpRes] = await Promise.all([
        supabase.from("ai_settings").update(ai as never).eq("user_id", user.id),
        supabase.from("scalp_settings").update(scalp as never).eq("user_id", user.id),
      ]);
      if (aiRes.error) throw aiRes.error;
      if (scalpRes.error) throw scalpRes.error;

      setEnabled(turnOn);
      toast({
        title: turnOn ? "Aggressive Growth Mode ON" : "Reverted to safe defaults",
        description: turnOn
          ? "Higher risk, higher reward. Expect bigger swings in both directions."
          : "Conservative limits restored. The bot will trade more cautiously.",
      });
    } catch (e) {
      toast({
        title: "Could not update settings",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-panel p-6 space-y-4 border-2 border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Rocket className={`w-5 h-5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
          <div>
            <h3 className="font-semibold text-foreground">Aggressive Growth Mode</h3>
            <p className="text-xs text-muted-foreground">
              One toggle. Higher risk, higher potential return.
            </p>
          </div>
        </div>
        <Switch
          checked={enabled}
          disabled={saving}
          onCheckedChange={(v) => apply(v)}
        />
      </div>

      {enabled ? (
        <div className="p-3 rounded-lg bg-loss/10 border border-loss/30 text-sm space-y-1">
          <div className="flex items-center gap-2 text-loss font-medium">
            <AlertTriangle className="w-4 h-4" />
            Active — expect bigger drawdowns
          </div>
          <ul className="text-xs text-foreground/80 list-disc pl-5 space-y-0.5">
            <li>Risk tolerance: ultra-aggressive</li>
            <li>Moonshot scanner prioritized</li>
            <li>Position size up to 15% of equity</li>
            <li>Up to 10 concurrent AI trades / 18 scalps</li>
            <li>Daily loss limit raised to 8%</li>
            <li>Take-profit pushed to 2.5%, entries loosened</li>
          </ul>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-secondary/30 text-xs text-muted-foreground flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            Safe defaults active. Capital preservation first — gains will be slower but
            drawdowns smaller.
          </span>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        No bot can guarantee profits. This preset accepts more variance in exchange for
        more upside. Test in paper mode before flipping it on live.
      </p>

      {enabled && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={saving}
          onClick={() => apply(false)}
        >
          Revert to safe defaults
        </Button>
      )}
    </div>
  );
}

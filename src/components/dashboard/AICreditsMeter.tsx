import { useEffect, useState } from "react";
import { Sparkles, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function AICreditsMeter() {
  const { user } = useAuth();
  const [monthSpend, setMonthSpend] = useState(0);
  const [budget, setBudget] = useState(25);

  const load = async () => {
    if (!user) return;
    const monthStart = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString();
    const [{ data: usage }, { data: settings }] = await Promise.all([
      supabase.from("ai_usage_log").select("cost_usd").eq("user_id", user.id).gte("created_at", monthStart),
      supabase.from("ai_settings").select("ai_monthly_budget_usd").eq("user_id", user.id).maybeSingle(),
    ]);
    const spent = (usage || []).reduce((s, r: any) => s + Number(r.cost_usd || 0), 0);
    setMonthSpend(spent);
    setBudget(Number((settings as any)?.ai_monthly_budget_usd ?? 25));
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`ai-meter-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_usage_log", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const pct = Math.min(100, (monthSpend / Math.max(0.01, budget)) * 100);
  const danger = pct >= 90;
  const warn = pct >= 70 && pct < 90;
  const barColor = danger ? "bg-loss" : warn ? "bg-yellow-500" : "bg-primary";

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">AI Workspace Usage</span>
          <span className="text-xs text-muted-foreground">this month</span>
        </div>
        <span className={`text-sm font-semibold ${danger ? "text-loss" : warn ? "text-yellow-500" : "text-foreground"}`}>
          ${monthSpend.toFixed(2)} / ${budget.toFixed(0)}
        </span>
      </div>
      <div className="h-2 w-full bg-secondary/40 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {(danger || warn) && (
        <p className={`text-xs mt-1.5 ${danger ? "text-loss" : "text-yellow-500"}`}>
          {danger ? "⚠ Near monthly budget. " : "Approaching monthly budget. "}
          Top up workspace credits to keep AI features running.{" "}
          <a
            href="https://lovable.dev/settings/workspace"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            Workspace settings <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      )}
    </div>
  );
}

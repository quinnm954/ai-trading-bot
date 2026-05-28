import { useEffect, useState } from "react";
import { Sparkles, ExternalLink, Pencil, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export function AICreditsMeter() {
  const { user } = useAuth();
  const [monthSpend, setMonthSpend] = useState(0);
  const [budget, setBudget] = useState(25);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("25");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!user) return;
    const monthStart = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString();
    const [{ data: usage }, { data: settings }] = await Promise.all([
      supabase.from("ai_usage_log").select("cost_usd").eq("user_id", user.id).gte("created_at", monthStart),
      supabase.from("ai_settings").select("ai_monthly_budget_usd").eq("user_id", user.id).maybeSingle(),
    ]);
    const spent = (usage || []).reduce((s, r: any) => s + Number(r.cost_usd || 0), 0);
    setMonthSpend(spent);
    const b = Number((settings as any)?.ai_monthly_budget_usd ?? 25);
    setBudget(b);
    setDraft(String(b));
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

  const saveBudget = async () => {
    if (!user) return;
    const v = Number(draft);
    if (!isFinite(v) || v <= 0) {
      toast.error("Enter a positive number");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("ai_settings")
      .update({ ai_monthly_budget_usd: v })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Failed to save budget");
      return;
    }
    setBudget(v);
    setEditing(false);
    toast.success("Budget updated");
  };

  const pct = Math.min(100, (monthSpend / Math.max(0.01, budget)) * 100);
  const danger = pct >= 90;
  const warn = pct >= 70 && pct < 90;
  const barColor = danger ? "bg-loss" : warn ? "bg-yellow-500" : "bg-primary";

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground">In-app AI Spend</span>
          <span className="text-xs text-muted-foreground">this month (estimate)</span>
        </div>
        {editing ? (
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              type="number"
              min={1}
              step={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-16 bg-secondary/40 border border-border rounded px-1.5 py-0.5 text-sm text-foreground"
              autoFocus
            />
            <button
              onClick={saveBudget}
              disabled={saving}
              className="p-1 rounded hover:bg-secondary/60 text-profit"
              aria-label="Save budget"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setEditing(false); setDraft(String(budget)); }}
              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground"
              aria-label="Cancel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className={`text-sm font-semibold ${danger ? "text-loss" : warn ? "text-yellow-500" : "text-foreground"}`}>
              ${monthSpend.toFixed(2)} / ${budget.toFixed(0)}
            </span>
            <button
              onClick={() => setEditing(true)}
              className="p-1 rounded hover:bg-secondary/60 text-muted-foreground"
              aria-label="Edit monthly cap"
            >
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      <div className="h-2 w-full bg-secondary/40 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] mt-1.5 text-muted-foreground leading-tight">
        Estimated cost of AI calls made by this app. Your real Lovable workspace balance lives in{" "}
        <a
          href="https://lovable.dev/settings/workspace"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-primary hover:underline"
        >
          workspace settings <ExternalLink className="w-2.5 h-2.5" />
        </a>.
      </p>
      {(danger || warn) && (
        <p className={`text-xs mt-1 ${danger ? "text-loss" : "text-yellow-500"}`}>
          {danger ? "⚠ Near your set cap. " : "Approaching your set cap. "}
          Raise the cap or top up workspace credits.
        </p>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Sparkles, Zap, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const CREDIT_PACKS = [
  { id: "starter", credits: 500,   price: "$5",  blurb: "~250 audits or quick chats" },
  { id: "popular", credits: 2500,  price: "$20", blurb: "Best value — 5x credits", highlight: true },
  { id: "pro",     credits: 10000, price: "$70", blurb: "Power users · heavy automation" },
];

export function AICreditsMeter() {
  const { user } = useAuth();
  const [monthSpend, setMonthSpend] = useState(0);
  const [budget, setBudget] = useState(25);
  const [credits, setCredits] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const monthStart = new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).toISOString();
    const [{ data: usage }, { data: settings }, { data: bal }] = await Promise.all([
      supabase.from("ai_usage_log").select("cost_usd").eq("user_id", user.id).gte("created_at", monthStart),
      supabase.from("ai_settings").select("ai_monthly_budget_usd").eq("user_id", user.id).maybeSingle(),
      supabase.from("ai_credit_balances").select("credits").eq("user_id", user.id).maybeSingle(),
    ]);
    const spent = (usage || []).reduce((s, r: any) => s + Number(r.cost_usd || 0), 0);
    setMonthSpend(spent);
    setBudget(Number((settings as any)?.ai_monthly_budget_usd ?? 25));
    setCredits(Number((bal as any)?.credits ?? 0));
  };

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel(`ai-meter-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_usage_log", filter: `user_id=eq.${user.id}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "ai_credit_balances", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    // Verify any pending checkout from URL
    const url = new URL(window.location.href);
    if (url.searchParams.get("credits_purchase") === "success") {
      const sid = url.searchParams.get("session_id");
      if (sid) {
        supabase.functions.invoke("verify-credit-purchase", { body: { session_id: sid } }).then(({ data }) => {
          if ((data as any)?.status === "credited") {
            toast({ title: "Credits added", description: `+${(data as any).credits} credits` });
          }
          load();
        });
      }
      url.searchParams.delete("credits_purchase");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.toString());
    }
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const pct = Math.min(100, (monthSpend / Math.max(0.01, budget)) * 100);
  const danger = pct >= 90;
  const warn = pct >= 70 && pct < 90;
  const barColor = danger ? "bg-loss" : warn ? "bg-yellow-500" : "bg-primary";

  const buy = async (pack: string) => {
    setBusy(pack);
    try {
      const { data, error } = await supabase.functions.invoke("create-credit-checkout", { body: { pack } });
      if (error) throw error;
      const url = (data as any)?.url;
      if (url) window.open(url, "_blank");
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass-panel p-4 flex flex-col sm:flex-row sm:items-center gap-4">
      {/* Workspace AI usage meter */}
      <div className="flex-1 min-w-0">
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
        <Progress value={pct} className="h-2" indicatorClassName={barColor} />
        {danger && (
          <p className="text-xs text-loss mt-1.5">
            ⚠ You're near your monthly budget. Top up workspace credits to keep AI features running.
          </p>
        )}
        {warn && !danger && (
          <p className="text-xs text-yellow-500 mt-1.5">Approaching monthly budget — consider topping up soon.</p>
        )}
      </div>

      {/* In-app credit balance + purchase */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="flex items-center gap-1 justify-end">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">In-app credits</span>
          </div>
          <p className="font-bold text-foreground">{credits.toLocaleString()}</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm">Top up</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Top up AI credits</DialogTitle>
              <DialogDescription>
                Credits power in-app AI features (audits, advisor, fusion analysis). Choose a pack below.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
              {CREDIT_PACKS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => buy(p.id)}
                  disabled={busy !== null}
                  className={`text-left p-4 rounded-lg border transition-all hover:border-primary ${
                    p.highlight ? "border-primary bg-primary/5" : "border-border"
                  } disabled:opacity-50`}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-foreground">{p.price}</span>
                    {p.highlight && <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">Popular</span>}
                  </div>
                  <p className="font-medium text-foreground mt-1">{p.credits.toLocaleString()} credits</p>
                  <p className="text-xs text-muted-foreground mt-1">{p.blurb}</p>
                  {busy === p.id && <p className="text-xs text-primary mt-2">Opening checkout…</p>}
                </button>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-2">
                Workspace credits power the underlying AI gateway. If your <strong>workspace</strong> bar is red,
                top up there to keep all AI features running.
              </p>
              <a
                href="https://lovable.dev/settings/workspace"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Open workspace settings <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

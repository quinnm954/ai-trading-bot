import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DollarSign, Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export function LiveInvestmentBasis() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [value, setValue] = useState<string>('100');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('ai_settings')
        .select('live_initial_investment')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.live_initial_investment != null) {
        setValue(String(data.live_initial_investment));
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a positive number.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('ai_settings')
      .update({ live_initial_investment: num })
      .eq('user_id', user.id);
    setSaving(false);
    toast(error
      ? { title: 'Save failed', description: error.message, variant: 'destructive' }
      : { title: 'Live basis updated', description: `Live P&L now measured from $${num.toFixed(2)}.` });
  };

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-primary" />
          Live Investment Basis
        </CardTitle>
        <CardDescription>
          Starting dollar amount your live-mode P&amp;L is measured from. Set this to what you've actually deposited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Initial investment (USD)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              step={0.01}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={loading || saving}
              className="font-mono"
            />
            <Button onClick={save} disabled={loading || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

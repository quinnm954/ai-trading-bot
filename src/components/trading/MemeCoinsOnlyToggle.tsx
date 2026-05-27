import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Rocket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

export function MemeCoinsOnlyToggle() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('ai_settings')
        .select('meme_coins_only')
        .eq('user_id', user.id)
        .maybeSingle();
      setEnabled(!!(data as any)?.meme_coins_only);
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (next: boolean) => {
    if (!user) return;
    setEnabled(next);
    const { error } = await supabase
      .from('ai_settings')
      .update({ meme_coins_only: next } as any)
      .eq('user_id', user.id);
    if (error) {
      setEnabled(!next);
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
      return;
    }
    toast({
      title: next ? '🐸 Meme-coins-only mode ON' : 'Full universe restored',
      description: next
        ? 'AI will only trade meme coins (DOGE, PEPE, SHIB, WIF, BONK, etc.)'
        : 'AI will trade the full eligible crypto universe.',
    });
  };

  return (
    <Card className="border-primary/30">
      <CardContent className="flex items-center justify-between gap-4 py-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-md bg-primary/10 text-primary">
            <Rocket className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Label htmlFor="meme-only" className="text-sm font-semibold cursor-pointer">
                Meme coins only
              </Label>
              {enabled && <Badge variant="secondary" className="text-[10px]">ACTIVE</Badge>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Restrict AI trading to a meme-coin allowlist (DOGE, PEPE, SHIB, WIF, BONK, FLOKI…). Sub-cent prices allowed.
            </p>
          </div>
        </div>
        <Switch id="meme-only" checked={enabled} disabled={loading} onCheckedChange={toggle} />
      </CardContent>
    </Card>
  );
}

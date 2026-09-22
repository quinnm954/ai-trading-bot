import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

/**
 * Copy trading is a pure mirror: while it is switched on, the only buys that
 * open are the ones copied from the trader, at the trader's own size, and none
 * of the app's risk rules are applied to them.
 */
export function CopyTradeMirrorToggle() {
  return (
    <Card className="bg-card/50 border-amber-500/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          Copy trading mirrors the trader exactly
        </CardTitle>
        <CardDescription>
          While copy trading is on, the only buys that open are the ones copied from
          the trader you follow — your own trading never opens a position.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Each copied trade uses the same amount the trader used, as long as you have
          the cash for it. Your stop-loss, profit target, time limit, position size
          caps and how many trades can run at once are all ignored.
        </p>
        <p>
          A copied position closes only when the trader closes it.
        </p>
        <Badge variant="outline" className="border-amber-500/50 text-amber-400">
          No safety limits apply to copied trades — losses can be larger than usual
        </Badge>
      </CardContent>
    </Card>
  );
}

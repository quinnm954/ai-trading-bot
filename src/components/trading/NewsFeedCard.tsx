import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2, Newspaper, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useCryptoNews } from '@/hooks/useCryptoNews';

function sentimentBadge(s: number) {
  if (s > 0.15) return { label: 'Bullish', variant: 'default' as const, Icon: TrendingUp };
  if (s < -0.15) return { label: 'Bearish', variant: 'destructive' as const, Icon: TrendingDown };
  return { label: 'Neutral', variant: 'secondary' as const, Icon: Minus };
}

export function NewsFeedCard({ symbol }: { symbol?: string }) {
  const { data: items, isLoading, error, refetch, isFetching } = useCryptoNews(symbol);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary" />
            Crypto News Feed {symbol && <Badge variant="outline">{symbol}</Badge>}
          </CardTitle>
          <CardDescription>
            Aggregated from CoinDesk, Cointelegraph, Decrypt, The Block. Auto-refreshed every 15 min.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Refresh'}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading news…
          </div>
        )}
        {error && <div className="text-sm text-destructive">Failed to load news.</div>}
        {!isLoading && items && items.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No crypto news yet. The scanner runs every 15 min.
          </div>
        )}
        {!isLoading && items && items.length > 0 && (
          <ScrollArea className="h-[560px] pr-3">
            <div className="space-y-3">
              {items.map((n) => {
                const s = sentimentBadge(n.sentiment);
                return (
                  <a
                    key={n.id}
                    href={n.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border bg-card/50 p-3 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium leading-snug">{n.title}</div>
                        {n.summary && (
                          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.summary}</div>
                        )}
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground mt-0.5" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                      <Badge variant="outline">{n.source}</Badge>
                      <Badge variant={s.variant} className="gap-1">
                        <s.Icon className="w-3 h-3" /> {s.label}
                      </Badge>
                      {n.symbols.map((sym) => (
                        <Badge key={sym} variant="secondary">{sym}</Badge>
                      ))}
                      <span className="text-muted-foreground ml-auto">
                        {formatDistanceToNow(new Date(n.published_at), { addSuffix: true })}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Loader2, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Level = { price: number; size: number };

interface BookState {
  bids: Level[];
  asks: Level[];
  spread: number;
  mid: number;
}

const COINBASE_BASE = 'https://api.exchange.coinbase.com';
const DEPTH = 12;

async function fetchBook(productId: string): Promise<BookState | null> {
  const res = await fetch(`${COINBASE_BASE}/products/${productId}/book?level=2`);
  if (!res.ok) return null;
  const data = await res.json();

  const parse = (rows: [string, string, number][] = []): Level[] =>
    rows.slice(0, DEPTH).map(([price, size]) => ({ price: Number(price), size: Number(size) }));

  const bids = parse(data?.bids);
  const asks = parse(data?.asks);
  if (!bids.length || !asks.length) return null;

  const spread = asks[0].price - bids[0].price;
  const mid = (asks[0].price + bids[0].price) / 2;
  return { bids, asks, spread, mid };
}

const fmtPrice = (v: number) =>
  v >= 1 ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
         : v.toPrecision(4);

const fmtSize = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString('en-US', { maximumFractionDigits: 4 });

interface Props {
  productId: string;
  refreshMs?: number;
}

/**
 * Read-only Level 2 market depth from Coinbase's public API.
 * Display only — orders are placed by the trading agents, not from here.
 */
export function OrderBookCard({ productId, refreshMs = 4000 }: Props) {
  const [book, setBook] = useState<BookState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchBook(productId);
      if (next) {
        setBook(next);
        setError(null);
      } else {
        setBook(null);
        setError(`No order book for ${productId}`);
      }
    } catch {
      setError('Could not reach the exchange feed');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    setLoading(true);
    setBook(null);
    void load();
    const id = setInterval(() => { void load(); }, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  const maxSize = useMemo(() => {
    if (!book) return 0;
    return Math.max(...book.bids.map((b) => b.size), ...book.asks.map((a) => a.size));
  }, [book]);

  return (
    <div className="glass-panel p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Order Book</h2>
          <Badge variant="secondary" className="text-xs">{productId}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">Read-only</Badge>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => void load()}
            aria-label="Refresh order book"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {loading && !book ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-secondary/40" />
          ))}
        </div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>
      ) : book ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Mid price</p>
              <p className="text-lg font-bold text-foreground">${fmtPrice(book.mid)}</p>
            </div>
            <div className="rounded-lg bg-secondary/30 p-3">
              <p className="text-xs text-muted-foreground">Spread</p>
              <p className="text-lg font-bold text-foreground">
                {((book.spread / book.mid) * 100).toFixed(3)}%
              </p>
            </div>
            <div className="col-span-2 rounded-lg bg-secondary/30 p-3 sm:col-span-1">
              <p className="text-xs text-muted-foreground">Best bid / ask</p>
              <p className="text-sm font-semibold text-foreground">
                <span className="text-profit">${fmtPrice(book.bids[0].price)}</span>
                {' / '}
                <span className="text-loss">${fmtPrice(book.asks[0].price)}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {([
              { label: 'Bids', icon: TrendingUp, rows: book.bids, tone: 'profit' as const },
              { label: 'Asks', icon: TrendingDown, rows: book.asks, tone: 'loss' as const },
            ]).map(({ label, icon: Icon, rows, tone }) => (
              <div key={label}>
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span className={`flex items-center gap-1 ${tone === 'profit' ? 'text-profit' : 'text-loss'}`}>
                    <Icon className="h-3.5 w-3.5" /> {label}
                  </span>
                  <span>Size</span>
                </div>
                <div className="space-y-0.5">
                  {rows.map((row, i) => (
                    <div
                      key={`${label}-${i}`}
                      className="relative flex items-center justify-between overflow-hidden rounded px-2 py-1 text-xs tabular-nums"
                    >
                      <div
                        className={`absolute inset-y-0 right-0 ${tone === 'profit' ? 'bg-profit/15' : 'bg-loss/15'}`}
                        style={{ width: maxSize ? `${(row.size / maxSize) * 100}%` : '0%' }}
                      />
                      <span className={`relative font-medium ${tone === 'profit' ? 'text-profit' : 'text-loss'}`}>
                        ${fmtPrice(row.price)}
                      </span>
                      <span className="relative text-muted-foreground">{fmtSize(row.size)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

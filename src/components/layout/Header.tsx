import { Search, User, LogOut, Menu, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useRef, useState } from 'react';
import { NotificationsPanel } from '@/components/layout/NotificationsPanel';

interface HeaderProps {
  onMenuClick: () => void;
}

const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Home',
  '/ai-trader': 'AI Trader',
  '/ai-advisor': 'AI Advisor',
  '/ai-learning': 'Learning Engine',
  '/risk-management': 'Risk',
  '/trades': 'Trades',
  '/leverage': 'Leverage',
  '/backtesting': 'Backtesting',
  '/strategy-control': 'Strategy',
  '/crypto-signals': 'Signals',
  '/fusion': 'Fusion',
  '/api-keys': 'API Keys',
  '/settings': 'Settings',
  '/admin': 'Admin',
};

const SEARCH_TARGETS: { label: string; path: string; keywords: string[] }[] = [
  { label: 'Home / Dashboard', path: '/dashboard', keywords: ['equity', 'pnl', 'overview', 'balance'] },
  { label: 'AI Trader', path: '/ai-trader', keywords: ['bot', 'start', 'stop', 'autonomous'] },
  { label: 'AI Advisor', path: '/ai-advisor', keywords: ['recommendation', 'advice'] },
  { label: 'Learning Engine', path: '/ai-learning', keywords: ['backtest', 'optimize', 'learning'] },
  { label: 'Risk Management', path: '/risk-management', keywords: ['stop loss', 'risk', 'drawdown', 'kill switch'] },
  { label: 'Trades / Journal', path: '/trades', keywords: ['history', 'journal', 'positions', 'expectancy'] },
  { label: 'Agent Console', path: '/agents', keywords: ['agents', 'watcher', 'healer', 'analyst'] },
  { label: 'Strategy Control', path: '/strategy-control', keywords: ['strategy', 'scalp', 'grid', 'momentum'] },
  { label: 'Crypto Signals', path: '/crypto-signals', keywords: ['signals', 'sentiment', 'copy trading'] },
  { label: 'Titan Fusion', path: '/fusion', keywords: ['fusion', 'conviction'] },
  { label: 'Leverage', path: '/leverage', keywords: ['leverage', 'margin'] },
  { label: 'Backtesting', path: '/backtesting', keywords: ['backtest', 'simulate'] },
  { label: 'Market Depth', path: '/market-depth', keywords: ['order book', 'depth', 'liquidity'] },
  { label: 'Wallet', path: '/wallet', keywords: ['usdc', 'wallet', 'payment', 'deposit'] },
  { label: 'API Keys', path: '/api-keys', keywords: ['coinbase', 'broker', 'connect', 'api'] },
  { label: 'Settings', path: '/settings', keywords: ['notifications', 'preferences', 'export', 'reset'] },
  { label: 'Pricing & Subscription', path: '/pricing', keywords: ['price', 'billing', 'subscription', '29'] },
];

export function Header({ onMenuClick }: HeaderProps) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const blurTimer = useRef<number | null>(null);
  const title = ROUTE_TITLES[location.pathname] ?? 'Titan AI';

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to sign out. Please try again.',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Signed out',
        description: 'You have been successfully signed out.',
      });
    }
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_TARGETS.filter(
      (t) => t.label.toLowerCase().includes(q) || t.keywords.some((k) => k.includes(q))
    ).slice(0, 6);
  }, [query]);

  const goTo = (path: string) => {
    setQuery('');
    setSearchOpen(false);
    navigate(path);
  };

  const initial = (user?.email?.[0] || 'T').toUpperCase();

  return (
    <header
      className="sticky top-0 z-30 bg-background/70 backdrop-blur-xl hairline-b"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-14 lg:h-16 items-center justify-between px-3 lg:px-6 safe-x">
        {/* Left: menu (desktop only) + avatar (mobile) */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Account"
                className="lg:hidden tap w-9 h-9 rounded-full bg-gradient-to-br from-primary/30 to-accent text-foreground font-display font-semibold text-sm flex items-center justify-center ring-1 ring-border"
              >
                {initial}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut} className="text-loss cursor-pointer">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Desktop search */}
          <div className="relative w-80 hidden md:block ml-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => {
                blurTimer.current = window.setTimeout(() => setSearchOpen(false), 120);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results[0]) goTo(results[0].path);
                if (e.key === 'Escape') setSearchOpen(false);
              }}
              placeholder="Search pages, strategies, risk..."
              className="pl-10 bg-secondary border-border"
              aria-label="Search the app"
            />
            {searchOpen && query.trim() && (
              <div className="absolute left-0 right-0 top-full mt-2 rounded-xl border border-border bg-popover shadow-lg overflow-hidden z-50">
                {results.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">No matches</p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.path}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-secondary text-left"
                      onMouseDown={() => {
                        if (blurTimer.current) window.clearTimeout(blurTimer.current);
                        goTo(r.path);
                      }}
                    >
                      <span>{r.label}</span>
                      <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center: page title (mobile) */}
        <h1 className="lg:hidden absolute left-1/2 -translate-x-1/2 font-display text-[15px] font-semibold tracking-tight pointer-events-none">
          {title}
        </h1>

        {/* Right: notifications + desktop user */}
        <div className="flex items-center gap-1 lg:gap-3 justify-end flex-1">
          <NotificationsPanel />

          {/* Desktop-only user chip */}
          <div className="hidden lg:flex items-center gap-3 pl-3 border-l border-border">
            <div className="text-right">
              <p className="text-sm font-medium truncate max-w-[150px]">
                {user?.email?.split('@')[0] || 'Trader'}
              </p>
              <p className="text-xs text-muted-foreground">Paper Trading</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full bg-secondary" aria-label="Account">
                  <User className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} className="text-loss cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
}

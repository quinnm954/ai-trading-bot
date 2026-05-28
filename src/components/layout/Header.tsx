import { Bell, Search, User, LogOut, Menu } from 'lucide-react';
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
import { useLocation } from 'react-router-dom';

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
  '/moonshot-scanner': 'Moonshots',
  '/leverage': 'Leverage',
  '/backtesting': 'Backtesting',
  '/strategy-control': 'Strategy',
  '/crypto-signals': 'Signals',
  '/fusion': 'Fusion',
  '/api-keys': 'API Keys',
  '/settings': 'Settings',
  '/admin': 'Admin',
};

export function Header({ onMenuClick }: HeaderProps) {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
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
              placeholder="Search symbols, strategies..."
              className="pl-10 bg-secondary border-border"
            />
          </div>
        </div>

        {/* Center: page title (mobile) */}
        <h1 className="lg:hidden absolute left-1/2 -translate-x-1/2 font-display text-[15px] font-semibold tracking-tight pointer-events-none">
          {title}
        </h1>

        {/* Right: notifications + desktop user */}
        <div className="flex items-center gap-1 lg:gap-3 justify-end flex-1">
          <Button variant="ghost" size="icon" className="tap relative" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-background" />
          </Button>

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

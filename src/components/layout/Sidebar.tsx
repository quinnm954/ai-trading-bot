import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Layers, 
  Brain, 
  Bot, 
  History, 
  Key, 
  Settings,
  TrendingUp,
  Zap,
  GraduationCap,
  Wallet,
  RefreshCw,
  X,
  Shield,
  Rocket
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/strategies', icon: Layers, label: 'Strategies' },
  { path: '/ai-advisor', icon: Brain, label: 'AI Advisor' },
  { path: '/ai-trader', icon: Bot, label: 'Autonomous AI', badge: 'AUTO' },
  { path: '/ai-learning', icon: GraduationCap, label: 'AI Learning', badge: 'NEW' },
  { path: '/moonshot-scanner', icon: Rocket, label: 'Moonshot Scanner', badge: '🚀' },
  { path: '/risk-management', icon: Shield, label: 'Risk Management' },
  { path: '/trades', icon: History, label: 'Trade History' },
  { path: '/api-keys', icon: Key, label: 'API Keys' },
  { path: '/pricing', icon: TrendingUp, label: 'Pricing' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

interface LiveAccount {
  provider: string;
  balance: number;
  equity: number;
  lastSynced: string | null;
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const [liveAccount, setLiveAccount] = useState<LiveAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchLiveAccount = async () => {
      const { data } = await supabase
        .from('live_account')
        .select('provider, balance, equity, last_synced_at')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setLiveAccount({
          provider: data.provider,
          balance: data.balance,
          equity: data.equity,
          lastSynced: data.last_synced_at,
        });
      }
      setIsLoading(false);
    };

    fetchLiveAccount();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('sidebar-live-account')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_account',
        },
        () => fetchLiveAccount()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    onClose();
  }, [location.pathname]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const getTimeSinceSync = () => {
    if (!liveAccount?.lastSynced) return 'Never';
    const diff = Date.now() - new Date(liveAccount.lastSynced).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  };

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 z-50 h-screen w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-in-out",
        "lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex items-center justify-between gap-3 px-4 py-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-success rounded-full border-2 border-sidebar animate-pulse" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Titan AI</h1>
                <p className="text-xs text-muted-foreground">Trading Engine</p>
              </div>
            </div>
            {/* Close button for mobile */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden"
              onClick={onClose}
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'nav-item',
                    isActive && 'active'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                  {'badge' in item && item.badge && (
                    <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold rounded bg-primary/20 text-primary">
                      {item.badge}
                    </span>
                  )}
                  {item.path === '/ai-trader' && (
                    <span className="ml-1 flex items-center gap-1 text-xs text-success">
                      <Zap className="w-3 h-3" />
                      Live
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Live Account Balance */}
          {liveAccount && (
            <div className="p-4 border-t border-sidebar-border">
              <div className="glass-panel p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    <span className="text-xs font-medium text-foreground capitalize">
                      {liveAccount.provider}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-success/20 text-success">
                    Connected
                  </span>
                </div>
                <div className="text-lg font-bold text-foreground">
                  {formatCurrency(liveAccount.equity)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <RefreshCw className="w-3 h-3" />
                  <span>Synced {getTimeSinceSync()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
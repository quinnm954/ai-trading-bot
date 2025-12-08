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
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/strategies', icon: Layers, label: 'Strategies' },
  { path: '/ai-advisor', icon: Brain, label: 'AI Advisor' },
  { path: '/ai-trader', icon: Bot, label: 'AI Auto-Trader' },
  { path: '/trades', icon: History, label: 'Trade History' },
  { path: '/api-keys', icon: Key, label: 'API Keys' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
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
                {item.path === '/ai-trader' && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-success">
                    <Zap className="w-3 h-3" />
                    Live
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border">
          <div className="glass-panel p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Paper Trading</span>
              <span className="px-2 py-0.5 text-xs rounded-full bg-warning/20 text-warning">
                Demo
              </span>
            </div>
            <div className="text-sm font-medium text-foreground">
              $125,847.32
            </div>
            <div className="text-xs text-profit flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +$2,341.56 today
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

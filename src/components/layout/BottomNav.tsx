import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, History, Shield, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { path: '/ai-trader', icon: Bot, label: 'Scalper' },
  { path: '/risk-management', icon: Shield, label: 'Risk' },
  { path: '/trades', icon: History, label: 'Trades' },
];

interface BottomNavProps {
  onMore: () => void;
}

export function BottomNav({ onMore }: BottomNavProps) {
  const location = useLocation();

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-stretch justify-around h-16">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 transition-colors active:scale-95',
                active ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <tab.icon className={cn('w-5 h-5', active && 'drop-shadow-[0_0_6px_hsl(var(--primary)/0.6)]')} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </NavLink>
          );
        })}
        <button
          onClick={onMore}
          className="flex flex-col items-center justify-center gap-1 flex-1 text-muted-foreground active:scale-95 transition-transform"
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </div>
    </nav>
  );
}

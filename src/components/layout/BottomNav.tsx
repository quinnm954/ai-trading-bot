import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  Shield,
  History,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { path: '/ai-trader', icon: Bot, label: 'Trader' },
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
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 tab-bar hairline-t"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Primary"
    >
      <div className="flex items-stretch justify-around h-[var(--tab-bar-h)] px-2">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          const Icon = tab.icon;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className="flex-1 flex items-start justify-center pt-2.5"
              aria-label={tab.label}
            >
              <span
                className={cn(
                  'tap flex flex-col items-center gap-1 min-w-[64px] py-1.5 rounded-2xl',
                  active && 'bg-primary/10'
                )}
              >
                <Icon
                  className={cn(
                    'w-6 h-6 transition-colors',
                    active
                      ? 'text-primary drop-shadow-[0_0_8px_hsl(var(--primary-glow)/0.7)]'
                      : 'text-muted-foreground'
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
                <span
                  className={cn(
                    'text-[10.5px] font-semibold tracking-tight transition-colors',
                    active ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {tab.label}
                </span>
              </span>
            </NavLink>
          );
        })}
        <button
          onClick={onMore}
          className="flex-1 flex items-start justify-center pt-2.5"
          aria-label="More"
        >
          <span className="tap flex flex-col items-center gap-1 min-w-[64px] py-1.5 rounded-2xl text-muted-foreground">
            <MoreHorizontal className="w-6 h-6" />
            <span className="text-[10.5px] font-semibold tracking-tight">More</span>
          </span>
        </button>
      </div>
    </nav>
  );
}

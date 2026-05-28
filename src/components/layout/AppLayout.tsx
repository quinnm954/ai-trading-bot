import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { useAutoTakeProfit } from '@/hooks/useAutoTakeProfit';
import { useSubscription } from '@/hooks/useSubscription';
import { TrialBanner } from '@/components/subscription/TrialBanner';
import { TrialExpiredOverlay } from '@/components/subscription/TrialExpiredOverlay';
import { ScalpingDisclaimer } from '@/components/compliance/ScalpingDisclaimer';
import { useState } from 'react';

export function AppLayout() {
  useAutoTakeProfit();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showTrialBanner = false;
  const showExpiredOverlay = false;

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {showExpiredOverlay && <TrialExpiredOverlay />}
      {showTrialBanner && <TrialBanner daysRemaining={0} />}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <ScalpingDisclaimer />
        <main
          className="px-4 pt-4 lg:px-6 lg:pt-6 safe-x"
          style={{
            paddingBottom:
              'calc(env(safe-area-inset-bottom) + var(--tab-bar-h) + 1.25rem)',
          }}
        >
          <Outlet />
        </main>
      </div>

      <BottomNav onMore={() => setSidebarOpen(true)} />
    </div>
  );
}


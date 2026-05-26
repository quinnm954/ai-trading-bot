import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BottomNav } from './BottomNav';
import { useAutoTakeProfit } from '@/hooks/useAutoTakeProfit';
import { useSubscription } from '@/hooks/useSubscription';
import { TrialBanner } from '@/components/subscription/TrialBanner';
import { TrialExpiredOverlay } from '@/components/subscription/TrialExpiredOverlay';
import { useState } from 'react';

export function AppLayout() {
  useAutoTakeProfit();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const {
    isInTrial,
    isTrialExpired,
    trialDaysRemaining,
    subscribed,
    isFreeAccess,
    isLoading,
  } = useSubscription();

  const showTrialBanner = isInTrial && !subscribed && !isFreeAccess && !isLoading;
  const showExpiredOverlay = isTrialExpired && !subscribed && !isFreeAccess && !isLoading;

  return (
    <div className="min-h-screen bg-background">
      {showExpiredOverlay && <TrialExpiredOverlay />}
      {showTrialBanner && <TrialBanner daysRemaining={trialDaysRemaining} />}

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main
          className="p-4 lg:p-6 pb-24 lg:pb-6"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)' }}
        >
          <Outlet />
        </main>
      </div>

      <BottomNav onMore={() => setSidebarOpen(true)} />
    </div>
  );
}

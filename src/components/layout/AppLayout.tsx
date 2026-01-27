import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAutoTakeProfit } from '@/hooks/useAutoTakeProfit';
import { useSubscription } from '@/hooks/useSubscription';
import { TrialBanner } from '@/components/subscription/TrialBanner';
import { TrialExpiredOverlay } from '@/components/subscription/TrialExpiredOverlay';
import { useState } from 'react';

export function AppLayout() {
  // Run take-profit checker globally when AI is enabled
  useAutoTakeProfit();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const { 
    isInTrial, 
    isTrialExpired, 
    trialDaysRemaining, 
    subscribed, 
    isFreeAccess,
    isLoading 
  } = useSubscription();

  // Determine if we should show trial UI
  const showTrialBanner = isInTrial && !subscribed && !isFreeAccess && !isLoading;
  const showExpiredOverlay = isTrialExpired && !subscribed && !isFreeAccess && !isLoading;

  return (
    <div className="min-h-screen bg-background">
      {/* Trial expired overlay - blocks all interaction */}
      {showExpiredOverlay && <TrialExpiredOverlay />}
      
      {/* Trial countdown banner */}
      {showTrialBanner && <TrialBanner daysRemaining={trialDaysRemaining} />}
      
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-64">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

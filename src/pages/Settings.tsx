import { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Bell, 
  Shield, 
  Database,
  Clock,
  Save,
  Scale,
  GraduationCap
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { InviteManager } from '@/components/settings/InviteManager';
import { SubscriptionManager } from '@/components/settings/SubscriptionManager';
import { LegalAndPrivacy } from '@/components/settings/LegalAndPrivacy';
import { PasswordChange } from '@/components/settings/PasswordChange';
import { ResetPaperBalance } from '@/components/settings/ResetPaperBalance';
import { CryptoWalletSettings } from '@/components/settings/CryptoWalletSettings';
import { LiveInvestmentBasis } from '@/components/settings/LiveInvestmentBasis';
import { DataManagement } from '@/components/settings/DataManagement';
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/notificationPrefs';

export default function Settings() {
  const [notifications, setNotifications] = useState<NotificationPrefs>(() => loadNotificationPrefs());

  const [general, setGeneral] = useState(() => {
    try {
      const raw = localStorage.getItem('titan_general_prefs');
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return { timezone: 'America/New_York', currency: 'USD', defaultLeverage: 1 };
  });

  const handleSave = () => {
    saveNotificationPrefs(notifications);
    localStorage.setItem('titan_general_prefs', JSON.stringify(general));
    toast.success('Settings saved');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <SettingsIcon className="w-7 h-7 text-primary" />
            Settings
          </h1>
          <p className="text-muted-foreground">Configure your trading preferences</p>
        </div>
        <Button onClick={handleSave} variant="glow" className="gap-2">
          <Save className="w-4 h-4" />
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
          <TabsTrigger value="general" className="gap-2">
            <SettingsIcon className="w-4 h-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="legal" className="gap-2">
            <Scale className="w-4 h-4" />
            Legal & Privacy
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Notifications */}
            <div className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-6">
                <Bell className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Notifications</h3>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium text-foreground">Trade Executions</p>
                    <p className="text-xs text-muted-foreground">Get notified when trades are opened/closed</p>
                  </div>
                  <Switch 
                    checked={notifications.trades}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, trades: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium text-foreground">Profit Alerts</p>
                    <p className="text-xs text-muted-foreground">Notify when positions hit profit targets</p>
                  </div>
                  <Switch 
                    checked={notifications.profits}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, profits: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium text-foreground">Loss Alerts</p>
                    <p className="text-xs text-muted-foreground">Notify when stop-loss is triggered</p>
                  </div>
                  <Switch 
                    checked={notifications.losses}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, losses: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <p className="font-medium text-foreground">AI Decisions</p>
                    <p className="text-xs text-muted-foreground">Get updates on AI trading decisions</p>
                  </div>
                  <Switch 
                    checked={notifications.aiDecisions}
                    onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, aiDecisions: checked }))}
                  />
                </div>
              </div>
            </div>

            {/* General Settings */}
            <div className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-6">
                <Clock className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">General</h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Timezone</label>
                  <select 
                    value={general.timezone}
                    onChange={(e) => setGeneral(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-foreground"
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Display Currency</label>
                  <select 
                    value={general.currency}
                    onChange={(e) => setGeneral(prev => ({ ...prev, currency: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-foreground"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Default Leverage</label>
                  <Input 
                    type="number"
                    value={general.defaultLeverage}
                    onChange={(e) => setGeneral(prev => ({ ...prev, defaultLeverage: parseInt(e.target.value) }))}
                    min={1}
                    max={10}
                    className="bg-secondary border-border"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Paper trading only - real leverage coming in v2
                  </p>
                </div>
              </div>
            </div>

            {/* Data & Storage */}
            <DataManagement />

            {/* Onboarding & Help */}
            <div className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-6">
                <GraduationCap className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Onboarding & Help</h3>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-secondary/30">
                  <p className="font-medium text-foreground mb-2">Getting Started Tutorial</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Replay the onboarding tutorial to learn about paper trading, AI features, and risk management.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full gap-2"
                    onClick={() => {
                      localStorage.removeItem('titan_onboarding_completed');
                      toast.success('Tutorial reset! Visit the Dashboard to see it again.');
                    }}
                  >
                    <GraduationCap className="w-4 h-4" />
                    Replay Tutorial
                  </Button>
                </div>
              </div>
            </div>

            {/* Security */}
            <div className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-6">
                <Shield className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">Security</h3>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-secondary/30">
                  <p className="font-medium text-foreground mb-2">Paper Trading Mode</p>
                  <p className="text-sm text-muted-foreground">
                    Currently operating in paper trading mode. All trades are simulated 
                    and no real money is at risk.
                  </p>
                  <div className="mt-3 px-3 py-1.5 rounded-full bg-warning/20 text-warning text-xs font-medium inline-block">
                    Demo Mode Active
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-secondary/30">
                  <p className="font-medium text-foreground mb-2">API Key Encryption</p>
                  <p className="text-sm text-muted-foreground">
                    All API keys are encrypted using AES-256 encryption and stored securely.
                  </p>
                  <div className="mt-3 px-3 py-1.5 rounded-full bg-success/20 text-success text-xs font-medium inline-block">
                    Encrypted
                  </div>
                </div>
              </div>
            </div>

            {/* Password Change */}
            <PasswordChange />

            {/* Reset Paper Balance */}
            <ResetPaperBalance />

            {/* Live Investment Basis (P&L starting point) */}
            <LiveInvestmentBasis />



          </div>
          <div className="mt-6 space-y-6">
            <SubscriptionManager />
            <CryptoWalletSettings />
          </div>

          {/* Invite Management - Admin Only */}
          <div className="mt-6">
            <InviteManager />
          </div>
        </TabsContent>

        <TabsContent value="legal" className="mt-6">
          <LegalAndPrivacy />
        </TabsContent>
      </Tabs>
    </div>
  );
}

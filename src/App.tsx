import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { CookieConsent } from "./components/CookieConsent";
import { GoogleAnalytics } from "./components/GoogleAnalytics";
import Dashboard from "./pages/Dashboard";
// Strategies page removed — bot is scalping-only
import AIAdvisor from "./pages/AIAdvisor";
import AITrader from "./pages/AITrader";
import AILearningEngine from "./pages/AILearningEngine";
import RiskManagement from "./pages/RiskManagement";
import MoonshotScanner from "./pages/MoonshotScanner";
import LeverageTrading from "./pages/LeverageTrading";
import Backtesting from "./pages/Backtesting";
import StrategyControlCenter from "./pages/StrategyControlCenter";
import CryptoSignals from "./pages/CryptoSignals";
import Fusion from "./pages/Fusion";
import Trades from "./pages/Trades";
import ApiKeys from "./pages/ApiKeys";
import Settings from "./pages/Settings";
import CryptoWallet from "./pages/CryptoWallet";
import MarketDepth from "./pages/MarketDepth";
import Auth from "./pages/Auth";
import Pricing from "./pages/Pricing";
import Landing from "./pages/Landing";
import AdminDashboard from "./pages/AdminDashboard";
import AgentConsole from "./pages/AgentConsole";
import OAuthConsent from "./pages/OAuthConsent";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <GoogleAnalytics />
          <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              {/* /strategies route removed — scalping-only */}
              <Route path="/ai-advisor" element={<AIAdvisor />} />
              <Route path="/ai-trader" element={<AITrader />} />
              <Route path="/ai-learning" element={<AILearningEngine />} />
              <Route path="/risk-management" element={<RiskManagement />} />
              <Route path="/moonshot-scanner" element={<MoonshotScanner />} />
              <Route path="/leverage" element={<LeverageTrading />} />
              <Route path="/backtesting" element={<Backtesting />} />
              <Route path="/strategy-control" element={<StrategyControlCenter />} />
              <Route path="/crypto-signals" element={<CryptoSignals />} />
              <Route path="/fusion" element={<Fusion />} />
              <Route path="/trades" element={<Trades />} />
              <Route path="/api-keys" element={<ApiKeys />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/agents" element={<AgentConsole />} />
              <Route path="/admin" element={<AdminDashboard />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
          <CookieConsent />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

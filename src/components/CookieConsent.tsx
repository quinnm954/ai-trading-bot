import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, X, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CONSENT_KEY = 'titanai-cookie-consent';

type ConsentPreferences = {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
};

export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<Omit<ConsentPreferences, 'timestamp'>>({
    necessary: true, // Always required
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already made a choice
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      // Small delay to prevent flash on page load
      const timer = setTimeout(() => setIsVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const saveConsent = (prefs: Omit<ConsentPreferences, 'timestamp'>) => {
    const consent: ConsentPreferences = {
      ...prefs,
      timestamp: Date.now(),
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    setIsVisible(false);
    
    // You can dispatch an event here for analytics tools to listen to
    window.dispatchEvent(new CustomEvent('cookieConsentUpdate', { detail: consent }));
  };

  const handleAcceptAll = () => {
    saveConsent({
      necessary: true,
      analytics: true,
      marketing: true,
    });
  };

  const handleAcceptSelected = () => {
    saveConsent(preferences);
  };

  const handleRejectAll = () => {
    saveConsent({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-fade-in">
      <div className="max-w-4xl mx-auto glass-panel p-6 border border-border shadow-2xl">
        <div className="flex items-start gap-4">
          <div className="p-2 rounded-lg bg-primary/20 flex-shrink-0">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
          
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-1">We value your privacy</h3>
              <p className="text-sm text-muted-foreground">
                We use cookies to enhance your browsing experience, analyze site traffic, and personalize content. 
                By clicking "Accept All", you consent to our use of cookies. You can customize your preferences 
                or reject non-essential cookies.{' '}
                <Link to="/settings" className="text-primary hover:underline">
                  Learn more in our Privacy Policy
                </Link>
              </p>
            </div>

            {/* Cookie Details Panel */}
            {showDetails && (
              <div className="space-y-3 p-4 rounded-lg bg-secondary/50 border border-border">
                <h4 className="text-sm font-medium text-foreground">Cookie Preferences</h4>
                
                {/* Necessary Cookies */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Strictly Necessary</p>
                    <p className="text-xs text-muted-foreground">Required for the site to function properly</p>
                  </div>
                  <div className="px-2 py-1 rounded bg-muted text-xs text-muted-foreground">
                    Always Active
                  </div>
                </div>

                {/* Analytics Cookies */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Analytics</p>
                    <p className="text-xs text-muted-foreground">Help us understand how visitors interact with our site</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.analytics}
                      onChange={(e) => setPreferences(p => ({ ...p, analytics: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                  </label>
                </div>

                {/* Marketing Cookies */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Marketing</p>
                    <p className="text-xs text-muted-foreground">Used to deliver relevant advertisements</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={preferences.marketing}
                      onChange={(e) => setPreferences(p => ({ ...p, marketing: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
                  </label>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {showDetails ? (
                <>
                  <Button onClick={handleAcceptSelected} variant="glow" size="sm">
                    Save Preferences
                  </Button>
                  <Button onClick={() => setShowDetails(false)} variant="outline" size="sm">
                    Back
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleAcceptAll} variant="glow" size="sm">
                    Accept All
                  </Button>
                  <Button onClick={handleRejectAll} variant="outline" size="sm">
                    Reject All
                  </Button>
                  <Button 
                    onClick={() => setShowDetails(true)} 
                    variant="ghost" 
                    size="sm"
                    className="gap-1"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    Customize
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={handleRejectAll}
            className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close cookie banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Utility function to check consent status
export function getCookieConsent(): ConsentPreferences | null {
  const stored = localStorage.getItem(CONSENT_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

// Utility function to reset consent (for settings page)
export function resetCookieConsent() {
  localStorage.removeItem(CONSENT_KEY);
  window.location.reload();
}

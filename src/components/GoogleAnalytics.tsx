import { useEffect, useState } from 'react';
import { getCookieConsent } from './CookieConsent';

// Replace with your actual GA4 Measurement ID
const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export function GoogleAnalytics() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadGA = () => {
      const consent = getCookieConsent();
      
      // Only load if analytics cookies are accepted
      if (!consent?.analytics) {
        return;
      }

      // Don't load if already loaded
      if (isLoaded || document.getElementById('ga-script')) {
        return;
      }

      // Load gtag.js script
      const script = document.createElement('script');
      script.id = 'ga-script';
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      document.head.appendChild(script);

      // Initialize gtag
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer.push(args);
      };
      window.gtag('js', new Date());
      window.gtag('config', GA_MEASUREMENT_ID, {
        anonymize_ip: true, // GDPR compliance
        cookie_flags: 'SameSite=None;Secure',
      });

      setIsLoaded(true);
    };

    // Check on mount
    loadGA();

    // Listen for consent updates
    const handleConsentUpdate = (event: CustomEvent) => {
      if (event.detail?.analytics) {
        loadGA();
      }
    };

    window.addEventListener('cookieConsentUpdate', handleConsentUpdate as EventListener);

    return () => {
      window.removeEventListener('cookieConsentUpdate', handleConsentUpdate as EventListener);
    };
  }, [isLoaded]);

  // This component doesn't render anything
  return null;
}

// Utility functions for tracking events
export const trackEvent = (
  eventName: string,
  eventParams?: Record<string, unknown>
) => {
  const consent = getCookieConsent();
  if (consent?.analytics && typeof window.gtag === 'function') {
    window.gtag('event', eventName, eventParams);
  }
};

export const trackPageView = (pagePath: string, pageTitle?: string) => {
  const consent = getCookieConsent();
  if (consent?.analytics && typeof window.gtag === 'function') {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: pagePath,
      page_title: pageTitle,
    });
  }
};

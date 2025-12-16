import { useEffect, useState } from 'react';
import { getCookieConsent } from './CookieConsent';

// GA4 and Google Ads IDs
const GA_MEASUREMENT_ID = 'G-C54B142ZJ0';
const GOOGLE_ADS_ID = 'AW-17458461715';

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
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
      document.head.appendChild(script);

      // Initialize gtag
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer.push(args);
      };
      window.gtag('js', new Date());
      
      // Configure GA4
      window.gtag('config', GA_MEASUREMENT_ID, {
        anonymize_ip: true, // GDPR compliance
        cookie_flags: 'SameSite=None;Secure',
      });
      
      // Configure Google Ads
      window.gtag('config', GOOGLE_ADS_ID);

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

// Track Google Ads conversion
export const trackConversion = (conversionId?: string) => {
  const consent = getCookieConsent();
  if (consent?.marketing && typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', {
      send_to: conversionId || `${GOOGLE_ADS_ID}/WWD2CPG9xNEbEJP464RB`,
    });
  }
};

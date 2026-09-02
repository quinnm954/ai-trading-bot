import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native app configuration for the App Store and Google Play builds.
 *
 * Store builds bundle the web app from `dist/` (no remote URL).
 * For live-reload against the Lovable sandbox during development run:
 *   CAP_LIVE_RELOAD=1 npx cap run ios     (or android)
 */
const liveReload = process.env.CAP_LIVE_RELOAD === '1';

const config: CapacitorConfig = {
  appId: 'app.lovable.p025e3af4bc0b40b0b747d5e969349fce',
  appName: 'TitanAI Trader',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#0a0a1a',
  },
  android: {
    backgroundColor: '#0a0a1a',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0a0a1a',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a1a',
    },
  },
  ...(liveReload
    ? {
        server: {
          url: 'https://025e3af4-bc0b-40b0-b747-d5e969349fce.lovableproject.com?forceHideBadge=true',
          cleartext: true,
        },
      }
    : {}),
};

export default config;

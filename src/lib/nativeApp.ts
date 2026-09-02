import { Capacitor } from '@capacitor/core';

/** True when running inside the iOS/Android shell rather than a browser. */
export const isNativeApp = () => Capacitor.isNativePlatform();

/**
 * Native-only startup: dark status bar and hiding the splash screen once
 * React has mounted. Safe no-op on the web.
 */
export async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0a0a1a' });
    }
  } catch (e) {
    console.warn('StatusBar unavailable', e);
  }

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch (e) {
    console.warn('SplashScreen unavailable', e);
  }
}

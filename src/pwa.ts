import { Capacitor } from '@capacitor/core';

export function registerPwaServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (Capacitor.isNativePlatform()) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((error) => {
        console.warn('PWA service worker registration failed:', error);
      });
  });
}

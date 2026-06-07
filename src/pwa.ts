import { Capacitor } from '@capacitor/core';

let reloadOnControllerChange = false;

export function registerPwaServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (Capacitor.isNativePlatform()) return;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!window.isSecureContext && window.location.hostname !== 'localhost') return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadOnControllerChange) return;
      reloadOnControllerChange = true;
      window.location.reload();
    });

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        registration.update().catch((error) => {
          console.warn('PWA service worker update check failed:', error);
        });
      })
      .catch((error) => {
        console.warn('PWA service worker registration failed:', error);
      });
  });
}

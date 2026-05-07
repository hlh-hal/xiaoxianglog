export type BrowserNotificationPermission = NotificationPermission | 'unsupported';

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  if (window.Notification.permission !== 'default') {
    return window.Notification.permission;
  }

  return window.Notification.requestPermission();
}

export async function openNotificationPermissionSettings(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const win = window as any;
  const capacitor = win.Capacitor;

  try {
    const appPlugin = capacitor?.Plugins?.App;
    if (capacitor?.isNativePlatform?.() && appPlugin?.openSettings) {
      await appPlugin.openSettings();
      return true;
    }
  } catch (error) {
    console.warn('Failed to open native app settings', error);
  }

  const userAgent = window.navigator.userAgent;

  if (/Android/i.test(userAgent)) {
    window.location.href = 'intent://settings/#Intent;action=android.settings.APP_NOTIFICATION_SETTINGS;end';
    return true;
  }

  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    window.location.href = 'app-settings:';
    return true;
  }

  const settingsUrl = /Firefox/i.test(userAgent)
    ? 'about:preferences#privacy'
    : 'chrome://settings/content/notifications';

  const opened = window.open(settingsUrl, '_blank');
  return !!opened;
}

export function canSendBrowserNotification() {
  return getBrowserNotificationPermission() === 'granted';
}

export function sendBrowserNotification(title: string, body: string) {
  if (!canSendBrowserNotification()) return false;

  new window.Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'xiang-inbox',
  });
  return true;
}

import { Capacitor, registerPlugin } from '@capacitor/core';

export type BrowserNotificationPermission = NotificationPermission | 'unsupported' | 'insecure';

interface NativeNotificationPermissionResult {
  display: 'granted' | 'denied' | 'default' | 'prompt';
}

interface XiangNotificationsPlugin {
  checkPermissions(): Promise<NativeNotificationPermissionResult>;
  requestPermissions(): Promise<NativeNotificationPermissionResult>;
  showNotification(options: { id?: number; title: string; body: string }): Promise<void>;
  scheduleDailyReminder(options: { hour: number; minute: number; title: string; body: string }): Promise<void>;
  cancelDailyReminder(): Promise<void>;
  openSettings(): Promise<void>;
}

const XiangNotifications = registerPlugin<XiangNotificationsPlugin>('XiangNotifications');

function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isSecureNotificationContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext || isLocalhost(window.location.hostname);
}

function normalizePermission(permission: NativeNotificationPermissionResult['display']): BrowserNotificationPermission {
  return permission === 'prompt' ? 'default' : permission;
}

export function getNotificationUnavailableReason(): string | null {
  if (isNativeAndroid()) return null;

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return '当前环境不支持系统通知';
  }

  if (!isSecureNotificationContext()) {
    return '浏览器通知需要 HTTPS，当前 HTTP 地址无法开启';
  }

  return null;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermission {
  if (isNativeAndroid()) {
    return 'default';
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  if (!isSecureNotificationContext()) {
    return 'insecure';
  }

  return window.Notification.permission;
}

export async function checkBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (isNativeAndroid()) {
    try {
      const result = await XiangNotifications.checkPermissions();
      return normalizePermission(result.display);
    } catch {
      return 'unsupported';
    }
  }

  return getBrowserNotificationPermission();
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (isNativeAndroid()) {
    try {
      const result = await XiangNotifications.requestPermissions();
      return normalizePermission(result.display);
    } catch {
      return 'unsupported';
    }
  }

  const unavailableReason = getNotificationUnavailableReason();
  if (unavailableReason) {
    return getBrowserNotificationPermission();
  }

  if (window.Notification.permission !== 'default') {
    return window.Notification.permission;
  }

  return window.Notification.requestPermission();
}

export async function openNotificationPermissionSettings(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (isNativeAndroid()) {
    try {
      await XiangNotifications.openSettings();
      return true;
    } catch (error) {
      console.warn('Failed to open native notification settings', error);
    }
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

export async function canSendBrowserNotification(): Promise<boolean> {
  return (await checkBrowserNotificationPermission()) === 'granted';
}

export async function sendBrowserNotification(title: string, body: string): Promise<boolean> {
  if (!(await canSendBrowserNotification())) return false;

  if (isNativeAndroid()) {
    try {
      await XiangNotifications.showNotification({ title, body });
      return true;
    } catch (error) {
      console.warn('Failed to send native notification', error);
      return false;
    }
  }

  new window.Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'xiang-inbox',
  });
  return true;
}

export async function scheduleDailyReminder(time: string, title: string, body: string): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  if ((await checkBrowserNotificationPermission()) !== 'granted') return false;

  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  await XiangNotifications.scheduleDailyReminder({ hour, minute, title, body });
  return true;
}

export async function cancelDailyReminder(): Promise<void> {
  if (!isNativeAndroid()) return;
  await XiangNotifications.cancelDailyReminder();
}

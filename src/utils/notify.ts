import { Capacitor, registerPlugin } from '@capacitor/core';
import { api, isAuthenticated } from '../services/apiClient';

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

export const DAILY_REMINDER_BODIES = [
  '该写点今天的故事了 ✍️',
  '今天，想记录点什么？',
  '留下今天的一句话吧',
  '别让今天悄悄溜走',
  '记录此刻的你',
  '用几分钟，收藏今天',
  '今天的心情，记一下吗？',
  '写给未来的自己',
  '你的今天，值得被记录',
  '打开日记，和自己聊聊吧',
];

export function getRandomDailyReminderBody(): string {
  return DAILY_REMINDER_BODIES[Math.floor(Math.random() * DAILY_REMINDER_BODIES.length)];
}

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

  return new Promise((resolve) => {
    const result = window.Notification.requestPermission(resolve);
    if (result && typeof result.then === 'function') {
      result.then(resolve);
    }
  });
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
    const intentUrl = 'intent://settings/#Intent;action=android.settings.NOTIFICATION_SETTINGS;end';
    const anchor = document.createElement('a');
    anchor.href = intentUrl;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
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

type SendNotificationOptions = {
  tag?: string;
  renotify?: boolean;
  data?: unknown;
};

type XiangNotificationOptions = NotificationOptions & {
  renotify?: boolean;
};

export type ServerNotificationPreferences = {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string;
  dailyReminderTimezone: string;
  socialNotifyEnabled: boolean;
  friendRequestNotifyEnabled: boolean;
};

export type PwaPushSubscriptionResult =
  | { ok: true }
  | { ok: false; reason: string };

const PUSH_SETUP_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, reason: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(reason)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  try {
    let registration = await navigator.serviceWorker.getRegistration();

    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    }

    registration.update().catch(error => console.warn('Failed to update service worker', error));

    if (registration.active) return registration;

    return await withTimeout(
      navigator.serviceWorker.ready,
      PUSH_SETUP_TIMEOUT_MS,
      'Service Worker 启动超时，请刷新或重新打开桌面应用后再试',
    );
  } catch (error) {
    console.warn('Failed to get service worker registration for notification', error);
    return null;
  }
}

function trySendPageNotification(title: string, options: NotificationOptions): boolean {
  try {
    new window.Notification(title, options);
    return true;
  } catch (error) {
    console.warn('Failed to send browser notification', error);
    return false;
  }
}

function dispatchServiceWorkerNotification(
  registration: ServiceWorkerRegistration,
  title: string,
  options: XiangNotificationOptions,
): void {
  window.setTimeout(() => {
    try {
      registration.showNotification(title, options).catch((error) => {
        console.warn('Failed to send service worker notification', error);
        trySendPageNotification(title, options);
      });
    } catch (error) {
      console.warn('Failed to send service worker notification', error);
      trySendPageNotification(title, options);
    }
  }, 0);
}

export async function sendBrowserNotification(
  title: string,
  body: string,
  options: SendNotificationOptions = {},
): Promise<boolean> {
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

  const notificationOptions: XiangNotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    tag: options.tag || 'xiang-notification',
    renotify: options.renotify,
    data: options.data,
  };

  const registration = await getReadyServiceWorkerRegistration();
  if (registration && 'showNotification' in registration) {
    dispatchServiceWorkerNotification(registration, title, notificationOptions);
    return true;
  }

  return trySendPageNotification(title, notificationOptions);
}

function urlBase64ToUint8Array(value: string): Uint8Array {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function bufferSourceToUint8Array(value: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  return new Uint8Array(value);
}

function isSameApplicationServerKey(current: BufferSource | null, expected: Uint8Array): boolean {
  if (!current) return true;

  const currentBytes = bufferSourceToUint8Array(current);
  if (currentBytes.byteLength !== expected.byteLength) return false;

  return currentBytes.every((byte, index) => byte === expected[index]);
}

async function createPushSubscription(
  registration: ServiceWorkerRegistration,
  applicationServerKey: Uint8Array,
): Promise<PushSubscription> {
  const subscribe = () => registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });

  try {
    return await withTimeout(
      subscribe(),
      PUSH_SETUP_TIMEOUT_MS,
      '创建推送订阅超时，请重新打开桌面应用后再试',
    );
  } catch (error) {
    const staleSubscription = await registration.pushManager.getSubscription().catch(() => null);
    if (staleSubscription) {
      await staleSubscription.unsubscribe().catch(unsubscribeError => (
        console.warn('Failed to unsubscribe stale push subscription', unsubscribeError)
      ));
    }

    return withTimeout(
      subscribe(),
      PUSH_SETUP_TIMEOUT_MS,
      '重建推送订阅超时，请重新打开桌面应用后再试',
    );
  }
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  } catch {
    return 'Asia/Shanghai';
  }
}

function isPwaPushSupported(): boolean {
  return typeof window !== 'undefined'
    && !isNativeAndroid()
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

export async function ensurePwaPushSubscription(): Promise<boolean> {
  return (await ensurePwaPushSubscriptionWithReason()).ok;
}

export async function ensurePwaPushSubscriptionWithReason(): Promise<PwaPushSubscriptionResult> {
  if (isNativeAndroid()) return { ok: true };
  if (!isAuthenticated()) return { ok: false, reason: '请先登录账号，系统通知需要绑定当前登录设备' };
  if (!isPwaPushSupported()) return { ok: false, reason: '当前浏览器不支持 PWA 后台推送' };
  if ((await checkBrowserNotificationPermission()) !== 'granted') {
    return { ok: false, reason: '请先允许系统通知权限' };
  }

  try {
    const keyResult = await withTimeout(
      api.get<{ publicKey: string; configured: boolean }>('/notifications/push/public-key'),
      PUSH_SETUP_TIMEOUT_MS,
      '获取推送配置超时，请稍后再试',
    );
    if (!keyResult.configured || !keyResult.publicKey) {
      return { ok: false, reason: '服务器推送服务还没有配置完成' };
    }

    const applicationServerKey = urlBase64ToUint8Array(keyResult.publicKey);
    const registration = await getReadyServiceWorkerRegistration();
    if (!registration || !('pushManager' in registration)) {
      return { ok: false, reason: '桌面应用后台服务未启动，请刷新或重新打开后再试' };
    }

    let subscription = await withTimeout(
      registration.pushManager.getSubscription(),
      PUSH_SETUP_TIMEOUT_MS,
      '读取推送订阅超时，请重新打开桌面应用后再试',
    );

    if (subscription && !isSameApplicationServerKey(subscription.options.applicationServerKey, applicationServerKey)) {
      await subscription.unsubscribe().catch(error => console.warn('Failed to replace old push subscription', error));
      subscription = null;
    }

    if (!subscription) {
      subscription = await createPushSubscription(registration, applicationServerKey);
    }

    await withTimeout(
      api.post('/notifications/push/subscribe', {
        subscription: subscription.toJSON(),
      }),
      PUSH_SETUP_TIMEOUT_MS,
      '保存推送订阅超时，请稍后再试',
    );
    return { ok: true };
  } catch (error: any) {
    console.warn('Failed to ensure PWA push subscription', error);
    return { ok: false, reason: error?.message || '开启系统通知失败，请稍后再试' };
  }
}

export async function getServerNotificationPreferences(): Promise<ServerNotificationPreferences | null> {
  if (!isAuthenticated()) return null;
  return api.get<ServerNotificationPreferences>('/notifications/preferences');
}

export async function updateServerNotificationPreferences(
  preferences: Partial<ServerNotificationPreferences>,
): Promise<ServerNotificationPreferences | null> {
  if (!isAuthenticated()) return null;
  return api.put<ServerNotificationPreferences>('/notifications/preferences', {
    dailyReminderTimezone: getBrowserTimezone(),
    ...preferences,
  });
}

export async function scheduleDailyReminder(time: string, title: string, body: string): Promise<boolean> {
  if (!isNativeAndroid()) {
    return getBrowserNotificationPermission() === 'granted';
  }
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

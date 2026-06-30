export const NOTIFICATION_STORAGE_KEYS = {
  social: 'setting_notify_enabled',
  friendRequest: 'setting_friend_request_enabled',
  monthlyEchoPush: 'setting_monthly_echo_push_enabled',
} as const;

export type NotificationStorageKey = typeof NOTIFICATION_STORAGE_KEYS[keyof typeof NOTIFICATION_STORAGE_KEYS];

const NOTIFIED_INTERACTIONS_KEY = 'xiang_notified_interactions';

export const notificationPreferenceStore = {
  isEnabled(key: NotificationStorageKey): boolean {
    return localStorage.getItem(key) !== 'false';
  },

  setEnabled(key: NotificationStorageKey, enabled: boolean): void {
    localStorage.setItem(key, String(enabled));
  },
};

export const interactionNotificationStore = {
  getIds(): Set<string> {
    try {
      const value = JSON.parse(localStorage.getItem(NOTIFIED_INTERACTIONS_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);
    } catch {
      return new Set();
    }
  },

  saveIds(ids: Set<string>): void {
    localStorage.setItem(NOTIFIED_INTERACTIONS_KEY, JSON.stringify([...ids].slice(-200)));
  },
};

export function getDailyReminderStorageKey(date: string, reminderTime: string): string {
  return `xiang_last_remind_${date}_${reminderTime}`;
}

export function clearTodayLocalReminderState(reminderTime: string, now = new Date()): void {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  localStorage.removeItem('last_remind_date');
  localStorage.removeItem(getDailyReminderStorageKey(date, reminderTime));
}

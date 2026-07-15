import { useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import type { DiaryEntryCreateInput } from '../diary/model';
import { diaryService } from '../../services/diaryService';
import { settingsService } from '../../services/settingsService';
import { api, isAuthenticated } from '../../services/apiClient';
import { firstInstallVaultOnboardingService } from '../../services/firstInstallVaultOnboardingService';
import {
  ensurePwaPushSubscription,
  getRandomDailyReminderBody,
  getServerNotificationPreferences,
  isNativeAndroid,
  scheduleDailyReminder,
  sendBrowserNotification,
  updateServerNotificationPreferences,
} from '../../utils/notify';
import {
  getDailyReminderStorageKey,
  interactionNotificationStore,
  NOTIFICATION_STORAGE_KEYS,
  notificationPreferenceStore,
} from '../notifications/notificationPreferences';

const WELCOME_ENTRY: DiaryEntryCreateInput = {
  id: 'welcome-diary-001',
  title: '欢迎来到小象日志 🐘',
  diaryDate: '',
  content: `## 你好，欢迎使用小象日志 🐘

很高兴你来到这里。小象日志是一个**安静、私密**的地方，专属于你的文字和记忆。

### 你可以用小象做什么？

✍️ **记录每一天**
用文字、图片记录生活中的点滴，小事也值得被记住。

🎨 **让日记更好看**
编辑时点击右上角调色板图标，可以为每篇日记选择专属背景主题，纯色、水墨、水彩……找到最适合你的那一款。

🌐 **逛逛日志圈**
在日志圈可以看到其他人的日志，产生共鸣，共同学习进步。

🤖 **和小象 AI 聊聊**
点击首页顶部的 AI 图标，小象 AI 会读取你的日记，帮你分析情绪、总结状态、给出温暖的建议，让你越来越懂自己。

🕰️ **那年今日**
写了一段时间后，每天打开「那年今日」，会看到过去同一天你写下的文字，时间会带你重新相遇。

📤 **分享日记**
阅读日记时点击分享图标，可以导出一张精美的图片，保存或分享给朋友。

🗂️ **图库 & 漫步**
所有日记里的图片会自动汇聚到图库，「漫步」功能会随机展示日记，像翻开一本相册。

### 开始写你的第一篇日记吧

点击右下角的 **+** 按钮，选择一个模板，或者直接开始写。

不需要写得多好，只要是真实的感受，就值得被记录。

小象会一直在这里陪着你。 🐘`,
  themeId: 'sys-ink-plum',
  mood: undefined,
  images: [],
};

async function loadCustomFonts(): Promise<void> {
  try {
    const fonts = await diaryService.getCustomFonts();
    for (const font of fonts) {
      try {
        const alreadyLoaded = [...document.fonts].some(loaded => loaded.family === font.fontFamily);
        if (!alreadyLoaded) {
          const fontFace = new FontFace(font.fontFamily, font.fileData);
          await fontFace.load();
          document.fonts.add(fontFace);
        }
      } catch (error) {
        console.warn(`字体 ${font.label} 恢复失败`, error);
      }
    }
  } catch (error) {
    console.error('Failed to load custom fonts from DB on startup', error);
  }
}

async function initWelcomeDiary(): Promise<void> {
  const today = new Date();
  const diaryDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
  const welcomeEntry = { ...WELCOME_ENTRY, diaryDate };

  if (localStorage.getItem('xiang_welcome_created')) {
    const existingWelcome = await diaryService.getEntryById(welcomeEntry.id!);
    const wasDamaged = Boolean(existingWelcome) && (
      existingWelcome!.title?.includes('娆㈣繋')
      || existingWelcome!.content.includes('浣犲ソ')
      || existingWelcome!.content.includes('data-diary-inline-image')
      || existingWelcome!.content.trim().length === 0
      || existingWelcome!.images.length > 0
    );
    if (wasDamaged) {
      await diaryService.updateEntry(welcomeEntry.id!, {
        ...welcomeEntry,
        createdAt: existingWelcome?.createdAt,
      });
    }
    return;
  }

  await diaryService.createEntry(welcomeEntry);
  localStorage.setItem('xiang_welcome_created', 'true');
}

function isReminderDue(reminderTime: string, now: Date): boolean {
  const [hourRaw, minuteRaw] = reminderTime.split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
  const reminderAt = new Date(now);
  reminderAt.setHours(hour, minute, 0, 0);
  return now >= reminderAt;
}

function reminderDate(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

async function sendDailyReminderIfNeeded(): Promise<void> {
  if (isNativeAndroid()) return;
  const settings = settingsService.getSettings();
  if (!settings.reminderEnabled) return;

  const now = new Date();
  if (!isReminderDue(settings.reminderTime, now)) return;
  const date = reminderDate(now);
  const reminderKey = getDailyReminderStorageKey(date, settings.reminderTime);
  if (localStorage.getItem(reminderKey) === '1') return;

  const sent = await sendBrowserNotification('小象日志', getRandomDailyReminderBody(), {
    tag: `xiang-daily-reminder-${date}-${settings.reminderTime}`,
    renotify: true,
    data: { url: '/editor' },
  });
  if (sent) localStorage.setItem(reminderKey, '1');
}

interface InteractionNotification {
  id: string;
  type: 'friend_request' | 'like' | 'comment' | 'daily_echo_ready' | string;
  content?: string | null;
  isRead?: boolean;
  refPostId?: string | null;
  refDiaryId?: string | null;
  fromUser?: { name?: string | null };
}

export function buildInteractionNotification(item: InteractionNotification) {
  if (item.type === 'daily_echo_ready') {
    return {
      title: '每日回声已生成',
      body: item.content?.trim() || '小象已经读完今天的故事，来看看吧。',
      tag: `xiang-daily-echo-ready-${item.id}`,
      url: item.refDiaryId ? `/editor?id=${encodeURIComponent(item.refDiaryId)}` : '/inbox',
    };
  }

  const senderName = item.fromUser?.name || '有新动态';
  if (item.type === 'friend_request') {
    if (!notificationPreferenceStore.isEnabled(NOTIFICATION_STORAGE_KEYS.friendRequest)) return null;
    return {
      title: '新的好友申请',
      body: item.content ? `${senderName} 申请添加你为好友：${item.content}` : `${senderName} 申请添加你为好友`,
      tag: `xiang-friend-request-${item.id}`,
      url: '/inbox',
    };
  }
  if ((item.type === 'like' || item.type === 'comment')
    && !notificationPreferenceStore.isEnabled(NOTIFICATION_STORAGE_KEYS.social)) return null;
  if (item.type === 'like') {
    return {
      title: '有人点赞了你的日志',
      body: `${senderName} 点赞了你的日志`,
      tag: `xiang-like-${item.id}`,
      url: item.refPostId ? `/post/${item.refPostId}` : '/inbox',
    };
  }
  if (item.type === 'comment') {
    return {
      title: '有人评论了你的日志',
      body: item.content ? `${senderName} 评论了你的日志：${item.content}` : `${senderName} 评论了你的日志`,
      tag: `xiang-comment-${item.id}`,
      url: item.refPostId ? `/post/${item.refPostId}` : '/inbox',
    };
  }
  return null;
}

async function sendInteractionNotifications(): Promise<void> {
  if (!isAuthenticated()) return;

  const notifications = await api.get<InteractionNotification[]>('/notifications?type=friend_request,like,comment,daily_echo_ready');
  const notifiedIds = interactionNotificationStore.getIds();
  let changed = false;
  for (const item of notifications || []) {
    if (item.isRead || notifiedIds.has(item.id)) continue;
    const notification = buildInteractionNotification(item);
    if (!notification) continue;
    const sent = await sendBrowserNotification(notification.title, notification.body, {
      tag: notification.tag,
      renotify: true,
      data: { url: notification.url },
    });
    if (sent) {
      notifiedIds.add(item.id);
      changed = true;
    }
  }
  if (changed) interactionNotificationStore.saveIds(notifiedIds);
}

async function syncExistingNotificationPreferences(): Promise<void> {
  if (!isAuthenticated()) return;
  const settings = settingsService.getSettings();
  const preference = await getServerNotificationPreferences();
  const wantsPush = settings.reminderEnabled
    || notificationPreferenceStore.isEnabled(NOTIFICATION_STORAGE_KEYS.social)
    || notificationPreferenceStore.isEnabled(NOTIFICATION_STORAGE_KEYS.friendRequest)
    || (preference?.monthlyEchoPushEnabled !== false
      && notificationPreferenceStore.isEnabled(NOTIFICATION_STORAGE_KEYS.monthlyEchoPush));

  if (isNativeAndroid()) {
    if (preference?.dailyReminderEnabled) {
      await updateServerNotificationPreferences({ dailyReminderEnabled: false });
    }
    return;
  }
  if (!wantsPush) return;
  await ensurePwaPushSubscription();
  if (settings.reminderEnabled && preference && !preference.dailyReminderEnabled) {
    await updateServerNotificationPreferences({
      dailyReminderEnabled: true,
      dailyReminderTime: settings.reminderTime,
    });
  }
}

/** AppShell 的启动与轮询协调器；路由组件不再持有具体功能实现。 */
export function useAppBootstrap(): void {
  useEffect(() => {
    const init = async () => {
      await diaryService.init();
      const existingEntries = await diaryService.getAllEntries().catch(() => []);
      await firstInstallVaultOnboardingService.initialize({ hasExistingEntries: existingEntries.length > 0 });
      await loadCustomFonts();
      await initWelcomeDiary();
      const settings = settingsService.getSettings();
      if (settings.reminderEnabled) {
        await scheduleDailyReminder(settings.reminderTime, '小象日志', getRandomDailyReminderBody()).catch(() => false);
      }
      await syncExistingNotificationPreferences()
        .catch(error => console.warn('Failed to sync notification preferences:', error));
    };
    void init().catch(error => console.error('Failed to finish app startup tasks', error));
  }, []);

  useEffect(() => {
    void sendDailyReminderIfNeeded().catch(error => console.warn('Failed to send daily reminder:', error));
    const interval = window.setInterval(() => {
      void sendDailyReminderIfNeeded().catch(error => console.warn('Failed to send daily reminder:', error));
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let disposed = false;
    let appStateListener: PluginListenerHandle | null = null;
    const poll = () => {
      void sendInteractionNotifications().catch(error => console.warn('Failed to poll interaction notifications:', error));
    };
    poll();
    const interval = window.setInterval(poll, 60000);
    const handleVisibilityChange = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) poll();
    }).then((listener) => {
      if (disposed) void listener.remove();
      else appStateListener = listener;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void appStateListener?.remove();
    };
  }, []);
}

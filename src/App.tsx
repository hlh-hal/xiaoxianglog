import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Editor from './pages/Editor';
import Community from './pages/Community';
import Profile from './pages/Profile';
import EditProfile from './pages/EditProfile';
import Settings from './pages/Settings';
import InsightDraftSettings from './pages/InsightDraftSettings';
import Gallery from './pages/Gallery';
import Walk from './pages/Walk';
import OnThisDay from './pages/OnThisDay';
import AnnualEcho from './pages/AnnualEcho';
import MonthlyEcho from './pages/MonthlyEcho';
import Trash from './pages/Trash';
import Search from './pages/Search';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import FirstRunVaultOnboarding from './pages/FirstRunVaultOnboarding';
import AIChat from './pages/AIChat';
import Leaderboard from './pages/Leaderboard';
import FriendList from './pages/FriendList';
import PostDetail from './pages/PostDetail';
import Help from './pages/Help';
import Inbox from './pages/Inbox';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import { diaryService } from './services/diaryService';
import { settingsService } from './services/settingsService';
import { AuthProvider } from './contexts/AuthContext';
import {
  ensurePwaPushSubscription,
  getServerNotificationPreferences,
  getRandomDailyReminderBody,
  isNativeAndroid,
  scheduleDailyReminder,
  sendBrowserNotification,
  updateServerNotificationPreferences,
} from './utils/notify';
import { api, isAuthenticated } from './services/apiClient';
import { firstInstallVaultOnboardingService } from './services/firstInstallVaultOnboardingService';

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const loadCustomFonts = async () => {
  try {
    const fonts = await diaryService.getCustomFonts();
    for (const font of fonts) {
      try {
        const alreadyLoaded = [...document.fonts].some(
          f => f.family === font.fontFamily
        );
        if (!alreadyLoaded) {
          const fontFace = new FontFace(font.fontFamily, font.fileData);
          await fontFace.load();
          document.fonts.add(fontFace);
        }
      } catch (err) {
        console.warn(`字体 ${font.label} 恢复失败`, err);
      }
    }
  } catch (err) {
    console.error('Failed to load custom fonts from DB on startup', err);
  }
};

const initWelcomeDiary = async () => {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const WELCOME_ENTRY = {
    id: 'welcome-diary-001',
    title: '欢迎来到小象日志 🐘',
    diaryDate: dateStr,
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
    status: 'active' as const,
    themeId: 'sys-ink-plum',
    mood: null,
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (localStorage.getItem('xiang_welcome_created')) {
    const existingWelcome = await diaryService.getEntryById(WELCOME_ENTRY.id);
    const wasDamagedByEncodingOrSmokeTest = Boolean(existingWelcome) && (
      existingWelcome.title.includes('娆㈣繋')
      || existingWelcome.content.includes('浣犲ソ')
      || existingWelcome.content.includes('data-diary-inline-image')
      || existingWelcome.content.trim().length === 0
      || existingWelcome.images.length > 0
    );

    if (wasDamagedByEncodingOrSmokeTest) {
      await diaryService.updateEntry(WELCOME_ENTRY.id, {
        ...WELCOME_ENTRY,
        createdAt: existingWelcome?.createdAt || WELCOME_ENTRY.createdAt,
      });
    }
    return;
  }

  await diaryService.createEntry(WELCOME_ENTRY);
  localStorage.setItem('xiang_welcome_created', 'true');
};
function isReminderDue(reminderTime: string, now: Date): boolean {
  const [hourRaw, minuteRaw] = reminderTime.split(':');
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;

  const reminderAt = new Date(now);
  reminderAt.setHours(hour, minute, 0, 0);
  return now >= reminderAt;
}

function formatReminderDate(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function getDailyReminderStorageKey(date: string, reminderTime: string): string {
  return `xiang_last_remind_${date}_${reminderTime}`;
}

async function sendDailyReminderIfNeeded(): Promise<void> {
  if (isNativeAndroid()) return;

  const settings = settingsService.getSettings();
  if (!settings.reminderEnabled) return;

  const now = new Date();
  if (!isReminderDue(settings.reminderTime, now)) return;

  const todayStr = formatReminderDate(now);
  const reminderKey = getDailyReminderStorageKey(todayStr, settings.reminderTime);
  if (localStorage.getItem(reminderKey) === '1') return;

  if (await sendBrowserNotification('小象日志', getRandomDailyReminderBody(), {
    tag: `xiang-daily-reminder-${todayStr}-${settings.reminderTime}`,
    renotify: true,
    data: { url: '/editor' },
  })) {
    localStorage.setItem(reminderKey, '1');
  }
}

function getNotifiedInteractionIds(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('xiang_notified_interactions') || '[]'));
  } catch {
    return new Set();
  }
}

function saveNotifiedInteractionIds(ids: Set<string>): void {
  localStorage.setItem('xiang_notified_interactions', JSON.stringify([...ids].slice(-200)));
}

function buildInteractionNotification(item: any): { title: string; body: string; tag: string; url: string } | null {
  const senderName = item.fromUser?.name || '有新动态';

  if (item.type === 'friend_request') {
    if (localStorage.getItem('setting_friend_request_enabled') === 'false') return null;
    return {
      title: '新的好友申请',
      body: item.content ? `${senderName} 申请添加你为好友：${item.content}` : `${senderName} 申请添加你为好友`,
      tag: `xiang-friend-request-${item.id}`,
      url: '/inbox',
    };
  }

  if ((item.type === 'like' || item.type === 'comment') && localStorage.getItem('setting_notify_enabled') === 'false') {
    return null;
  }

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
  if (
    localStorage.getItem('setting_friend_request_enabled') === 'false'
    && localStorage.getItem('setting_notify_enabled') === 'false'
  ) return;

  const notifications = await api.get<any[]>('/notifications?type=friend_request,like,comment');
  const notifiedIds = getNotifiedInteractionIds();
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

  if (changed) saveNotifiedInteractionIds(notifiedIds);
}

async function syncExistingNotificationPreferences(): Promise<void> {
  if (!isAuthenticated()) return;

  const settings = settingsService.getSettings();
  const socialNotifyEnabled = localStorage.getItem('setting_notify_enabled') !== 'false';
  const friendRequestNotifyEnabled = localStorage.getItem('setting_friend_request_enabled') !== 'false';
  const preference = await getServerNotificationPreferences();
  const monthlyEchoPushEnabled = preference?.monthlyEchoPushEnabled !== false
    && localStorage.getItem('setting_monthly_echo_push_enabled') !== 'false';

  if (isNativeAndroid()) {
    if (preference?.dailyReminderEnabled) {
      await updateServerNotificationPreferences({ dailyReminderEnabled: false });
    }
    return;
  }

  const wantsPush = settings.reminderEnabled || socialNotifyEnabled || friendRequestNotifyEnabled || monthlyEchoPushEnabled;
  if (!wantsPush) return;

  await ensurePwaPushSubscription();
  if (settings.reminderEnabled && preference && !preference.dailyReminderEnabled) {
    await updateServerNotificationPreferences({
      dailyReminderEnabled: true,
      dailyReminderTime: settings.reminderTime,
    });
  }
}

function FirstInstallVaultOnboardingGate() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const check = () => {
      if (
        firstInstallVaultOnboardingService.shouldShow()
        && location.pathname !== '/first-run/local-vault'
      ) {
        navigate('/first-run/local-vault', { replace: true });
      }
    };

    check();
    window.addEventListener(firstInstallVaultOnboardingService.stateChangedEvent, check);
    return () => {
      window.removeEventListener(firstInstallVaultOnboardingService.stateChangedEvent, check);
    };
  }, [location.pathname, navigate]);

  return null;
}

export default function App() {
  useEffect(() => {
    const init = async () => {
      await diaryService.init();
      const existingEntries = await diaryService.getAllEntries().catch(() => []);
      await firstInstallVaultOnboardingService.initialize({
        hasExistingEntries: existingEntries.length > 0,
      });
      await loadCustomFonts();
      await initWelcomeDiary();
      const settings = settingsService.getSettings();
      if (settings.reminderEnabled) {
        await scheduleDailyReminder(settings.reminderTime, '小象日志', getRandomDailyReminderBody()).catch(() => false);
      }
      await syncExistingNotificationPreferences().catch(error => console.warn('Failed to sync notification preferences:', error));

    };
    init().catch((error) => {
      console.error('Failed to finish app startup tasks', error);
    });
  }, []);

  useEffect(() => {
    sendDailyReminderIfNeeded().catch(error => console.warn('Failed to send daily reminder:', error));

    const interval = setInterval(() => {
      sendDailyReminderIfNeeded().catch(error => console.warn('Failed to send daily reminder:', error));
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    sendInteractionNotifications().catch(error => console.warn('Failed to poll interaction notifications:', error));

    const interval = setInterval(() => {
      sendInteractionNotifications().catch(error => console.warn('Failed to poll interaction notifications:', error));
    }, 60000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        sendInteractionNotifications().catch(error => console.warn('Failed to poll interaction notifications:', error));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <AuthProvider>
      <BrowserRouter>
        <FirstInstallVaultOnboardingGate />
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="community" element={<Community />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/edit" element={<EditProfile />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="walk" element={<Walk />} />
            <Route path="on-this-day" element={<OnThisDay />} />
            <Route path="annual-echo" element={<AnnualEcho />} />
            <Route path="monthly-echo" element={<MonthlyEcho />} />
            <Route path="trash" element={<Trash />} />
            <Route path="settings" element={<Settings />} />
            <Route path="settings/insight-draft" element={<InsightDraftSettings />} />
            <Route path="help" element={<Help />} />
            <Route path="search" element={<Search />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="ai-chat" element={<AIChat />} />
            <Route path="leaderboard" element={<Leaderboard />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="terms" element={<Terms />} />
          </Route>
          <Route path="/post/:id" element={<PostDetail />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/friends" element={<FriendList />} />
          <Route path="/first-run/local-vault" element={<FirstRunVaultOnboarding />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

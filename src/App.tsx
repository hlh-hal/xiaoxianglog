import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Editor from './pages/Editor';
import Community from './pages/Community';
import Profile from './pages/Profile';
import EditProfile from './pages/EditProfile';
import Settings from './pages/Settings';
import Gallery from './pages/Gallery';
import Walk from './pages/Walk';
import OnThisDay from './pages/OnThisDay';
import Trash from './pages/Trash';
import Search from './pages/Search';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
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
import { scheduleDailyReminder, sendBrowserNotification } from './utils/notify';

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
  if (localStorage.getItem('xiang_welcome_created')) return;

  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  const WELCOME_ENTRY = {
    id: 'welcome-diary-001',
    title: '欢迎来到小象日志 🐘',
    diaryDate: dateStr,
    content: `## 你好，欢迎使用小象日志 🐘

很高兴你来到这里。小象日志是一个安静、私密的地方，专属于你的文字和记忆。

你可以用小象做什么？

✍️ 记录每一天： 用文字、图片记录生活中的点滴，小事也值得被记住。

🎨 让日记更好看： 编辑时点击右上角调色板图标，可以为每篇日记选择专属背景主题，纯色、水墨、水彩……找到最适合你的那一款。

🌐 逛逛日志圈： 在日志圈可以看到其他人的日志，产生共鸣，共同学习进步。

🤖 和小象 AI 聊聊： 点击首页顶部的 AI 图标，小象 AI 会读取你的日记，帮你分析情绪、总结状态、给出温暖的建议，让你越来越懂自己。

🕰️ 那年今日： 写了一段时间后，每天打开「那年今日」，会看到过去同一天你写下的文字——时间会带你重新相遇。

📤 分享日记： 阅读日记时点击分享图标，可以导出一张精美的图片，保存或分享给朋友。

🗂️ 图库 & 漫步： 所有日记里的图片会自动汇聚到图库，「漫步」功能会随机展示日记，像翻开一本相册。

开始写你的第一篇日记吧

点击右下角的 + 按钮，选择一个模板，或者直接开始写。

不需要写得多好，只要是真实的感受，就值得被记录。

小象会一直在这里陪着你。🐘`,
    status: 'active' as const,
    themeId: 'sys-ink-plum',
    mood: null,
    images: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await diaryService.createEntry(WELCOME_ENTRY);
  localStorage.setItem('xiang_welcome_created', 'true');
};

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      await diaryService.init();          // 确保 DB 已初始化
      await loadCustomFonts();            // 加载自定义字体
      await initWelcomeDiary();           // 创建欢迎日记（仅首次）

      const settings = settingsService.getSettings();
      if (settings.reminderEnabled) {
        await scheduleDailyReminder(settings.reminderTime, '小象日志', '该写今天的日记啦，记录生活的美好 🐘').catch(() => false);
      }

      setIsInitialized(true);
    };
    init();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      const settings = settingsService.getSettings();
      if (!settings.reminderEnabled) return;
      const now = new Date();
      const currentHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (currentHm === settings.reminderTime) {
        const lastRemind = localStorage.getItem('last_remind_date');
        const todayStr = now.toLocaleDateString();
        if (lastRemind !== todayStr) {
          if (await sendBrowserNotification('小象日志', '该写今天的日记啦，记录生活的美好 🐘')) {
            localStorage.setItem('last_remind_date', todayStr);
          }
        }
      }
    }, 60000); // Check every minute
    return () => clearInterval(interval);
  }, []);

  if (!isInitialized) {
    return null; // 或者一个简单的加载指示器
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="community" element={<Community />} />
            <Route path="profile" element={<Profile />} />
            <Route path="profile/edit" element={<EditProfile />} />
            <Route path="gallery" element={<Gallery />} />
            <Route path="walk" element={<Walk />} />
            <Route path="on-this-day" element={<OnThisDay />} />
            <Route path="trash" element={<Trash />} />
            <Route path="settings" element={<Settings />} />
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';

type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstalledRelatedApp {
  platform?: string;
  id?: string;
  url?: string;
}

interface NavigatorWithPwa extends Navigator {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<InstalledRelatedApp[]>;
}

const INSTALL_DISMISS_KEY = 'xiang_pwa_install_prompt_dismissed';

function getNavigator(): NavigatorWithPwa | null {
  if (typeof navigator === 'undefined') return null;
  return navigator as NavigatorWithPwa;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = getNavigator();
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: minimal-ui)').matches
    || nav?.standalone === true;
}

function browserName(): string {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent;
  if (/Quark/i.test(ua) || /QuarkBrowser/i.test(ua)) return 'quark';
  if (/EdgA?/i.test(ua)) return 'edge';
  if (/CriOS|Chrome/i.test(ua)) return 'chrome';
  if (/Firefox/i.test(ua)) return 'firefox';
  if (/Safari/i.test(ua)) return 'safari';
  return 'browser';
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    } else {
      localStorage.removeItem(INSTALL_DISMISS_KEY);
    }
  } catch {
    // Ignore storage failures in private browsing modes.
  }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(isStandaloneDisplay);
  const [isInstalledRelated, setIsInstalledRelated] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const browser = useMemo(browserName, []);

  const refreshInstallState = useCallback(async () => {
    setIsStandalone(isStandaloneDisplay());
    setDismissed(false);
    writeDismissed(false);

    const nav = getNavigator();
    if (nav?.getInstalledRelatedApps) {
      try {
        const relatedApps = await nav.getInstalledRelatedApps();
        setIsInstalledRelated(relatedApps.length > 0);
      } catch {
        setIsInstalledRelated(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setDismissed(false);
      writeDismissed(false);
    };

    const handleInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      setDismissed(false);
      writeDismissed(false);
    };

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = () => setIsStandalone(isStandaloneDisplay());

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    mediaQuery.addEventListener?.('change', handleDisplayModeChange);
    refreshInstallState();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
      mediaQuery.removeEventListener?.('change', handleDisplayModeChange);
    };
  }, [refreshInstallState]);

  const promptInstall = useCallback(async (): Promise<PromptOutcome> => {
    if (!deferredPrompt) return 'unavailable';

    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);

    if (choice.outcome === 'dismissed') {
      setDismissed(true);
      writeDismissed(true);
    } else {
      setDismissed(false);
      writeDismissed(false);
    }

    return choice.outcome;
  }, [deferredPrompt]);

  const manualSteps = useMemo(() => {
    if (browser === 'quark') {
      return [
        '点击夸克底部菜单或右下角菜单。',
        '选择“添加到桌面”或“添加快捷方式”。',
        '如果没有看到入口，先用 Chrome 安装，或在系统桌面检查是否已有旧图标。',
      ];
    }

    if (browser === 'chrome') {
      return [
        '点击 Chrome 右上角三点菜单。',
        '选择“安装应用”或“添加到主屏幕”。',
        '如果刚删除过旧图标，先点“重新检测”，再刷新页面一次。',
      ];
    }

    return [
      '打开浏览器菜单。',
      '选择“添加到桌面”“添加快捷方式”或类似入口。',
      '若浏览器不支持安装，请改用 Android Chrome。',
    ];
  }, [browser]);

  return {
    browser,
    canPromptInstall: !!deferredPrompt,
    dismissed,
    isInstalled: isStandalone || isInstalledRelated,
    isStandalone,
    manualSteps,
    promptInstall,
    refreshInstallState,
  };
}

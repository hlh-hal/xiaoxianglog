import { useCallback, useEffect, useMemo, useState } from 'react';

type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable';

export type PwaInstallMode = 'installed' | 'prompt' | 'browser-menu' | 'unsupported' | 'unknown';
export type PwaBrowser = 'edge' | 'chrome' | 'quark' | 'qq' | 'safari' | 'firefox' | 'samsung' | 'browser';

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

interface ManifestData {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  display_override?: string[];
  icons?: Array<{
    src?: string;
    sizes?: string;
    type?: string;
    purpose?: string;
  }>;
}

interface InstallReadiness {
  isSecureContext: boolean;
  hasManifestLink: boolean;
  hasValidManifest: boolean;
  hasInstallIcon: boolean;
  hasServiceWorkerSupport: boolean;
  hasServiceWorkerRegistration: boolean;
}

const INSTALL_DISMISS_KEY = 'xiang_pwa_install_prompt_dismissed';

const defaultReadiness: InstallReadiness = {
  isSecureContext: false,
  hasManifestLink: false,
  hasValidManifest: false,
  hasInstallIcon: false,
  hasServiceWorkerSupport: false,
  hasServiceWorkerRegistration: false,
};

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

function isLocalhost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isSecureInstallContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.isSecureContext || isLocalhost(window.location.hostname);
}

function browserName(): PwaBrowser {
  if (typeof navigator === 'undefined') return 'browser';
  const ua = navigator.userAgent;

  if (/Quark|QuarkBrowser/i.test(ua)) return 'quark';
  if (/MQQBrowser|QQBrowser/i.test(ua)) return 'qq';
  if (/EdgA|EdgiOS|Edg\//i.test(ua)) return 'edge';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/FxiOS|Firefox/i.test(ua)) return 'firefox';
  if (/CriOS|Chrome|CriMo/i.test(ua)) return 'chrome';
  if (/Safari/i.test(ua)) return 'safari';
  return 'browser';
}

function browserDisplayName(browser: PwaBrowser): string {
  switch (browser) {
    case 'edge':
      return 'Microsoft Edge';
    case 'chrome':
      return 'Chrome';
    case 'quark':
      return '夸克';
    case 'qq':
      return 'QQ 浏览器';
    case 'safari':
      return 'Safari';
    case 'firefox':
      return 'Firefox';
    case 'samsung':
      return '三星浏览器';
    default:
      return '当前浏览器';
  }
}

function browserCanAddFromMenu(browser: PwaBrowser): boolean {
  return ['edge', 'chrome', 'quark', 'qq', 'safari', 'samsung'].includes(browser);
}

function isMobileLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function manifestHasInstallIcon(manifest: ManifestData): boolean {
  return !!manifest.icons?.some((icon) => {
    if (!icon.src || !icon.sizes) return false;
    return /(^|\s)192x192(\s|$)/i.test(icon.sizes) || /(^|\s)512x512(\s|$)/i.test(icon.sizes);
  });
}

function isValidInstallManifest(manifest: ManifestData): boolean {
  const hasName = !!(manifest.name || manifest.short_name);
  const hasStartUrl = !!manifest.start_url;
  const displayValues = [manifest.display, ...(manifest.display_override || [])].filter(Boolean);
  const hasStandaloneDisplay = displayValues.some((display) => (
    display === 'standalone'
    || display === 'fullscreen'
    || display === 'minimal-ui'
    || display === 'window-controls-overlay'
  ));

  return hasName && hasStartUrl && hasStandaloneDisplay && manifestHasInstallIcon(manifest);
}

async function getInstallReadiness(): Promise<InstallReadiness> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return defaultReadiness;

  const hasServiceWorkerSupport = 'serviceWorker' in navigator;
  let hasServiceWorkerRegistration = false;
  if (hasServiceWorkerSupport) {
    try {
      hasServiceWorkerRegistration = !!(await navigator.serviceWorker.getRegistration());
    } catch {
      hasServiceWorkerRegistration = false;
    }
  }

  const manifestLink = document.querySelector<HTMLLinkElement>('link[rel~="manifest"]');
  if (!manifestLink?.href) {
    return {
      ...defaultReadiness,
      isSecureContext: isSecureInstallContext(),
      hasServiceWorkerSupport,
      hasServiceWorkerRegistration,
    };
  }

  try {
    const response = await fetch(manifestLink.href, { credentials: 'same-origin' });
    const manifest = await response.json() as ManifestData;
    const hasInstallIcon = manifestHasInstallIcon(manifest);

    return {
      isSecureContext: isSecureInstallContext(),
      hasManifestLink: true,
      hasValidManifest: response.ok && isValidInstallManifest(manifest),
      hasInstallIcon,
      hasServiceWorkerSupport,
      hasServiceWorkerRegistration,
    };
  } catch {
    return {
      isSecureContext: isSecureInstallContext(),
      hasManifestLink: true,
      hasValidManifest: false,
      hasInstallIcon: false,
      hasServiceWorkerSupport,
      hasServiceWorkerRegistration,
    };
  }
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

function manualStepsFor(browser: PwaBrowser): string[] {
  switch (browser) {
    case 'edge':
      return [
        '打开 Microsoft Edge 底部菜单。',
        '选择“添加至手机”。',
        '按浏览器提示完成添加；如果刚删除过旧图标，请刷新页面后再试。',
      ];
    case 'chrome':
      return [
        '点击 Chrome 右上角三点菜单。',
        '选择“安装应用”或“添加到主屏幕”。',
        '按浏览器提示完成添加；如果刚删除过旧图标，请刷新页面后再试。',
      ];
    case 'quark':
      return [
        '点击夸克底部菜单或右下角菜单。',
        '选择“添加到桌面”或“添加快捷方式”。',
        '如果没有看到入口，可以复制链接到 Chrome 或 Edge 再添加。',
      ];
    case 'qq':
      return [
        '打开 QQ 浏览器底部菜单或工具菜单。',
        '选择“添加到桌面”或“添加快捷方式”。',
        '如果没有看到入口，可以复制链接到 Chrome 或 Edge 再添加。',
      ];
    case 'safari':
      return [
        '点击 Safari 分享按钮。',
        '选择“添加到主屏幕”。',
        '确认名称后点击“添加”。',
      ];
    case 'samsung':
      return [
        '打开三星浏览器菜单。',
        '选择“添加页面到”或“添加到主屏幕”。',
        '按浏览器提示完成添加。',
      ];
    case 'firefox':
      return [
        '打开 Firefox 菜单。',
        '查看是否有“安装”或“添加到主屏幕”入口。',
        '如果没有看到入口，可以复制链接到 Chrome 或 Edge 再添加。',
      ];
    default:
      return [
        '打开浏览器菜单。',
        '查找“添加到桌面”“添加到手机”“添加快捷方式”或类似入口。',
        '如果没有看到入口，可以复制链接到 Chrome 或 Edge 再添加。',
      ];
  }
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(isStandaloneDisplay);
  const [isInstalledRelated, setIsInstalledRelated] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [readiness, setReadiness] = useState<InstallReadiness>(() => ({
    ...defaultReadiness,
    isSecureContext: isSecureInstallContext(),
    hasServiceWorkerSupport: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  }));
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

    setReadiness(await getInstallReadiness());
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

  const isInstalled = isStandalone || isInstalledRelated;
  const canPromptInstall = !!deferredPrompt;
  const canUseBrowserMenu = readiness.isSecureContext
    && readiness.hasManifestLink
    && readiness.hasValidManifest
    && (browserCanAddFromMenu(browser) || (browser === 'browser' && isMobileLike()));
  const canAddToDevice = isInstalled || canPromptInstall || canUseBrowserMenu;

  const installMode = useMemo<PwaInstallMode>(() => {
    if (isInstalled) return 'installed';
    if (canPromptInstall) return 'prompt';
    if (canUseBrowserMenu) return 'browser-menu';
    if (!readiness.isSecureContext || (!readiness.hasManifestLink && browser !== 'browser')) return 'unsupported';
    return 'unknown';
  }, [browser, canPromptInstall, canUseBrowserMenu, isInstalled, readiness.hasManifestLink, readiness.isSecureContext]);

  const manualSteps = useMemo(() => manualStepsFor(browser), [browser]);
  const displayName = useMemo(() => browserDisplayName(browser), [browser]);
  const manualActionLabel = browser === 'edge' ? '添加至手机' : '添加到桌面';

  return {
    browser,
    browserDisplayName: displayName,
    canAddToDevice,
    canPromptInstall,
    dismissed,
    installMode,
    isInstalled,
    isStandalone,
    manualActionLabel,
    manualSteps,
    promptInstall,
    readiness,
    refreshInstallState,
  };
}

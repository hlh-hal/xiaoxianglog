import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Lightbulb, Loader2, MessageSquare, RefreshCw, X } from 'lucide-react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { authService } from '../services/authService';
import { diaryService } from '../services/diaryService';
import { AppSettings, FontSettings, settingsService } from '../services/settingsService';
import { localVaultService, VaultStatus } from '../services/localVaultService';
import { AppToast } from '../components/AppToast';
import { FontToolbar } from '../components/FontToolbar';
import {
  exportDiariesToMarkdown,
  importBackup,
  ParsedEntry,
  resolveUncertainDates,
  saveParsedEntries,
} from '../utils/importExport';
import {
  cancelDailyReminder,
  checkBrowserNotificationPermission,
  getBrowserNotificationPermission,
  getNotificationUnavailableReason,
  openNotificationPermissionSettings,
  requestBrowserNotificationPermission,
  scheduleDailyReminder,
} from '../utils/notify';

type PendingNotificationToggle =
  | { type: 'reminder' }
  | { type: 'notify' }
  | { type: 'friendRequest' };

const REMINDER_NOTIFICATION_TITLE = '小象日志';
const REMINDER_NOTIFICATION_BODY = '该写今天的日记啦，记录生活的美好 🐘';

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { returnToDrawer } = useOutletContext<any>();
  const [settings, setSettings] = useState<AppSettings>(settingsService.getSettings());
  const [fontSettings, setFontSettings] = useState<FontSettings>(() => settingsService.getFontSettings());
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState<'problem' | 'suggestion' | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [importData, setImportData] = useState<ParsedEntry[] | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [permissionFeatureName, setPermissionFeatureName] = useState('通知功能');
  const [pendingNotificationToggle, setPendingNotificationToggle] = useState<PendingNotificationToggle | null>(null);
  const [notifyEnabled, setNotifyEnabled] = useState(
    () => localStorage.getItem('setting_notify_enabled') !== 'false' && getBrowserNotificationPermission() === 'granted',
  );
  const [friendRequestEnabled, setFriendRequestEnabled] = useState(
    () => localStorage.getItem('setting_friend_request_enabled') !== 'false' && getBrowserNotificationPermission() === 'granted',
  );

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 3000);
  };

  const refreshVaultStatus = async () => {
    const status = await localVaultService.getVaultStatus();
    setVaultStatus(status);
    return status;
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const newSettings = settingsService.saveSettings({ [key]: value });
    setSettings(newSettings);
  };

  const updateLocalNotificationSetting = (
    key: string,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    enabled: boolean,
  ) => {
    setter(enabled);
    localStorage.setItem(key, String(enabled));
  };

  const handleFontSettingsChange = (newSettings: FontSettings) => {
    setFontSettings(newSettings);
    settingsService.saveFontSettings(newSettings);
  };

  useEffect(() => {
    refreshVaultStatus().catch(error => console.warn('Failed to load local vault status:', error));
  }, []);

  useEffect(() => {
    checkBrowserNotificationPermission().then((permission) => {
      const granted = permission === 'granted';
      setNotifyEnabled(localStorage.getItem('setting_notify_enabled') !== 'false' && granted);
      setFriendRequestEnabled(localStorage.getItem('setting_friend_request_enabled') !== 'false' && granted);

      if (permission === 'denied' || permission === 'unsupported' || permission === 'insecure') {
        if (settingsService.getSettings().reminderEnabled) {
          setSettings(settingsService.saveSettings({ reminderEnabled: false }));
        }
        updateLocalNotificationSetting('setting_notify_enabled', setNotifyEnabled, false);
        updateLocalNotificationSetting('setting_friend_request_enabled', setFriendRequestEnabled, false);
      }
    }).catch(error => console.warn('Failed to check notification permission:', error));
  }, []);

  const applyPendingNotificationToggle = (pending: PendingNotificationToggle | null) => {
    if (!pending) return;

    if (pending.type === 'reminder') {
      updateSetting('reminderEnabled', true);
      return;
    }

    if (pending.type === 'notify') {
      updateLocalNotificationSetting('setting_notify_enabled', setNotifyEnabled, true);
      return;
    }

    updateLocalNotificationSetting('setting_friend_request_enabled', setFriendRequestEnabled, true);
  };

  const ensureNotificationPermission = async (featureName: string, pendingToggle: PendingNotificationToggle) => {
    const permission = await requestBrowserNotificationPermission();
    if (permission === 'granted') {
      setPendingNotificationToggle(null);
      return true;
    }

    if (permission === 'unsupported' || permission === 'insecure') {
      showToast(`${getNotificationUnavailableReason() || '当前环境不支持系统通知'}，无法开启${featureName}`);
    } else if (permission === 'denied') {
      setPermissionFeatureName(featureName);
      setPendingNotificationToggle(pendingToggle);
      setActiveSheet('notificationPermission');
    } else {
      showToast(`请允许通知权限后再开启${featureName}`);
    }

    return false;
  };

  const handleOpenNotificationSettings = async () => {
    const opened = await openNotificationPermissionSettings();
    if (!opened) {
      showToast('请在系统或浏览器设置中手动开启通知权限');
    }
  };

  const handleReminderToggle = async (enabled: boolean) => {
    if (!enabled) {
      updateSetting('reminderEnabled', false);
      await cancelDailyReminder().catch(error => console.warn('Cancel reminder failed:', error));
      return;
    }

    const allowed = await ensureNotificationPermission('每日写日记提醒', { type: 'reminder' });
    updateSetting('reminderEnabled', allowed);
    if (allowed) {
      await scheduleDailyReminder(settings.reminderTime, REMINDER_NOTIFICATION_TITLE, REMINDER_NOTIFICATION_BODY)
        .catch(error => console.warn('Schedule reminder failed:', error));
    }
  };

  const handleReminderTimeChange = async (value: string) => {
    const updated = settingsService.saveSettings({ reminderTime: value });
    setSettings(updated);
    if (updated.reminderEnabled) {
      await scheduleDailyReminder(value, REMINDER_NOTIFICATION_TITLE, REMINDER_NOTIFICATION_BODY)
        .catch(error => console.warn('Schedule reminder failed:', error));
    }
  };

  const handleNotificationToggle = async (
    enabled: boolean,
    featureName: string,
    storageKey: string,
    setter: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    if (!enabled) {
      updateLocalNotificationSetting(storageKey, setter, false);
      return;
    }

    const allowed = await ensureNotificationPermission(
      featureName,
      storageKey === 'setting_notify_enabled' ? { type: 'notify' } : { type: 'friendRequest' },
    );
    updateLocalNotificationSetting(storageKey, setter, allowed);
  };

  const handleExport = async (formatName: string) => {
    if (formatName !== 'markdown') {
      showToast('暂只支持 Markdown 导出');
      return;
    }

    setActiveSheet(null);
    setIsLoading(true);
    try {
      const count = await exportDiariesToMarkdown();
      showToast(count > 0 ? `已导出 ${count} 篇日记` : '暂无可导出的日记');
    } catch (error) {
      console.error(error);
      showToast('导出失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChooseVaultDirectory = async () => {
    if (!localVaultService.isSupported()) {
      const status = await refreshVaultStatus();
      showToast(status.unavailableReason || '当前环境不支持选择本地日志文件夹');
      return;
    }

    setIsLoading(true);
    try {
      const status = await localVaultService.chooseVaultDirectory();
      setVaultStatus(status);
      if (status.available) {
        const result = await diaryService.syncAllEntriesToVault();
        showToast(result.count > 0 ? `本地日志文件夹已开启，已同步 ${result.count} 篇` : '本地日志文件夹已开启');
      } else {
        showToast(status.unavailableReason || '文件夹授权未完成');
      }
    } catch (error: any) {
      console.error(error);
      showToast(error?.message || '选择本地日志文件夹失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreFromVault = async () => {
    setIsLoading(true);
    try {
      const status = await refreshVaultStatus();
      if (!status.available) {
        showToast(
          status.provider === 'unsupported'
            ? '当前浏览器不支持直接读取文件夹，请使用“导入备份”选择 Markdown 文件'
            : (status.unavailableReason || '请先选择本地日志文件夹'),
        );
        return;
      }

      const result = await diaryService.syncEntriesFromVault();
      const details = [
        result.successCount ? `新增 ${result.successCount} 篇` : '',
        result.updatedCount ? `更新 ${result.updatedCount} 篇` : '',
        result.trashedCount ? `移入回收站 ${result.trashedCount} 篇` : '',
        result.skippedEmptyCount ? `跳过空文件 ${result.skippedEmptyCount} 个` : '',
        result.failCount ? `失败 ${result.failCount} 篇` : '',
      ].filter(Boolean).join('，');
      showToast(details ? `本地同步完成：${details}` : '本地同步完成，无新增修改');
    } catch (error: any) {
      console.error(error);
      showToast(error?.message || '从本地日志文件夹同步失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualCloudSync = async () => {
    setIsLoading(true);
    try {
      await diaryService.syncCurrentAccount();
      showToast('账号日志已同步');
    } catch (error: any) {
      console.error(error);
      showToast(error?.message || '账号同步失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImport = (useAI: boolean = false) => {
    setActiveSheet(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md';
    input.onchange = async () => {
      if (!input.files || input.files.length === 0) return;

      const file = input.files[0];
      setIsLoading(true);
      if (useAI) showToast('AI 正在全盘分析日记文本，请稍候...');

      try {
        let entries = await importBackup(file, useAI);
        if (!entries || entries.length === 0) {
          showToast('未识别到可导入的日记');
          return;
        }

        const uncertainCount = entries.filter((entry) => entry.dateUncertain).length;
        if (!useAI && uncertainCount > 0) {
          if (uncertainCount > 10) {
            showToast(`正在尝试补全 ${uncertainCount} 条模糊日期`);
          }
          entries = await resolveUncertainDates(entries);
        }

        setImportData(entries);
      } catch (error: any) {
        console.error(error);
        showToast(error?.message || '导入失败，请检查文件格式');
      } finally {
        setIsLoading(false);
      }
    };
    input.click();
  };

  const confirmImport = async () => {
    if (!importData) return;

    setIsLoading(true);
    try {
      const entriesToSave = importData.filter((entry) => !entry.skip);
      const { successCount, failCount } = await saveParsedEntries(entriesToSave);
      if (failCount > 0) {
        showToast(`已导入 ${successCount} 篇，${failCount} 篇日期不确定`);
      } else {
        showToast(`已导入 ${successCount} 篇日记`);
      }
      setImportData(null);
    } catch (error) {
      console.error(error);
      showToast('保存导入内容失败');
    } finally {
      setIsLoading(false);
    }
  };

  const submitFeedback = () => {
    if (!feedbackText.trim()) return;

    const subject = feedbackType === 'problem' ? '小象日志问题反馈' : '小象日志功能建议';
    const mailtoLink = `mailto:1647810838@qq.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(feedbackText)}`;
    window.location.href = mailtoLink;
    setActiveSheet(null);
    setFeedbackText('');
    window.setTimeout(() => showToast('已打开邮件应用'), 500);
  };

  const handleDeleteAccount = async () => {
    setIsLoading(true);
    try {
      await authService.deleteAccount();
      setActiveSheet(null);
      showToast('账号已注销，用户数据已删除');
      window.setTimeout(() => navigate('/login', { replace: true }), 1000);
    } catch (error: any) {
      console.error(error);
      showToast(error?.message || '注销失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const goBack = () => {
    if (location.state?.fromDrawer && returnToDrawer) {
      returnToDrawer();
    } else {
      navigate(-1);
    }
  };

  const getImportDateRange = () => {
    if (!importData) return '-';
    const dates = importData.filter((entry) => entry.date).map((entry) => entry.date).sort();
    if (dates.length === 0) return '-';
    return `${dates[0]} 至 ${dates[dates.length - 1]}`;
  };

  const getVaultDescription = () => {
    if (!vaultStatus) return '正在检查本地日志保存能力';
    if (vaultStatus.available) return vaultStatus.displayPath || '已授权本地文件夹';
    if (vaultStatus.supported) return vaultStatus.unavailableReason || '尚未开启本地保存';
    return vaultStatus.unavailableReason || '当前浏览器不支持文件夹写入，可使用导入/导出';
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) => (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full p-1 transition-colors duration-300 ${checked ? 'bg-primary' : 'bg-surface-container-highest'}`}
    >
      <span
        className={`block w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300 ${checked ? 'translate-x-5' : 'translate-x-0'}`}
      />
    </button>
  );

  const BottomSheet = ({
    isOpen,
    onClose,
    title,
    children,
  }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) => {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
        <div
          className="bg-surface w-full max-w-md rounded-t-3xl flex flex-col overflow-hidden shadow-2xl animate-in slide-in-from-bottom-full duration-300"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-container-high">
            <h3 className="font-headline font-semibold text-lg text-on-surface">{title}</h3>
            <button onClick={onClose} className="p-2 -mr-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 max-h-[70vh] overflow-y-auto" style={{ paddingBottom: 'max(1rem, var(--app-safe-bottom))' }}>
            {children}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body pb-10 relative animate-in fade-in slide-in-from-right-8 duration-300 ease-out">
      <AppToast message={toastMessage} />

      {isLoading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
          <div className="bg-surface p-4 rounded-2xl shadow-xl flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <span className="text-sm font-medium text-on-surface">处理中...</span>
          </div>
        </div>
      )}

      <header
        className="app-safe-header sticky top-0 z-40 flex items-center justify-between px-4 w-full transition-colors duration-300 bg-[#FAF9F5] dark:bg-[#1C1C1E]"
      >
        <button
          onClick={goBack}
          className="flex items-center justify-center rounded-[12px] transition-colors duration-300 bg-transparent active:bg-[rgba(0,0,0,0.06)] dark:active:bg-[rgba(255,255,255,0.08)] text-[#1C1C1E] dark:text-[#F2F2F7] shrink-0 relative z-10"
          style={{ width: '40px', height: '40px' }}
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1
          className="absolute left-1/2 -translate-x-1/2 m-0 text-[20px] font-[700] text-[#1C1C1E] dark:text-[#F2F2F7] transition-colors duration-300"
          style={{ fontFamily: 'inherit' }}
        >
          设置
        </h1>
        <div className="shrink-0" style={{ width: '40px', height: '40px' }} />
      </header>

      <main className="app-content-container space-y-8 pt-6">
        <section className="space-y-3">
          <SectionTitle title="提醒" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-container/50">
              <span className="text-[15px] font-medium">每日写日记提醒</span>
              <Toggle checked={settings.reminderEnabled} onChange={handleReminderToggle} />
            </div>
            <button
              className="w-full flex items-center justify-between px-5 py-4 active:bg-surface-container-low transition-colors duration-200 disabled:opacity-50"
              disabled={!settings.reminderEnabled}
              onClick={() => setActiveSheet('time')}
            >
              <span className="text-[15px] font-medium">提醒时间</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-on-surface-variant">{settings.reminderTime}</span>
                <ChevronRight className="w-5 h-5 text-outline-variant" />
              </div>
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="消息通知" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-container/50">
              <div className="flex flex-col items-start gap-1">
                <span className="text-[15px] font-medium">通知提示</span>
                <span className="text-xs text-on-surface-variant">
                  {notifyEnabled ? '收到点赞、评论时推送通知' : '已关闭，不会推送通知'}
                </span>
              </div>
              <Toggle
                checked={notifyEnabled}
                onChange={(value) => handleNotificationToggle(value, '通知提示', 'setting_notify_enabled', setNotifyEnabled)}
              />
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex flex-col items-start gap-1">
                <span className="text-[15px] font-medium">好友申请提示</span>
                <span className="text-xs text-on-surface-variant">
                  {friendRequestEnabled ? '收到好友申请时推送通知' : '已关闭，不会推送通知'}
                </span>
              </div>
              <Toggle
                checked={friendRequestEnabled}
                onChange={(value) => handleNotificationToggle(value, '好友申请提示', 'setting_friend_request_enabled', setFriendRequestEnabled)}
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="日记字体" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <button onClick={() => setActiveSheet('fontSettings')} className="w-full flex items-center justify-between px-5 py-4 active:bg-surface-container-low transition-colors">
              <span className="text-[15px] font-medium">字体样式</span>
              <ChevronRight className="w-5 h-5 text-outline-variant" />
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="编辑" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-container/50">
              <span className="text-[15px] font-medium">退出即保存</span>
              <Toggle checked={settings.saveOnExit} onChange={(value) => updateSetting('saveOnExit', value)} />
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex flex-col items-start">
                <span className="text-[15px] font-medium">自动调整时间</span>
                <span className="text-[11px] text-on-surface-variant/70">中午12点之前记录则自动转为前一天日记</span>
              </div>
              <Toggle checked={settings.autoAdjustTime} onChange={(value) => updateSetting('autoAdjustTime', value)} />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="账号同步" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <button
              onClick={handleManualCloudSync}
              className="w-full flex items-center justify-between px-5 py-4 active:bg-surface-container-low transition-colors"
            >
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-primary" />
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[15px] font-medium">立即同步账号日志</span>
                  <span className="text-xs text-on-surface-variant">同一账号在手机、电脑和不同浏览器保持一致</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-outline-variant" />
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="本地日志" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-surface-container/50">
              <div className="flex flex-col items-start gap-1 min-w-0 flex-1">
                <span className="text-[15px] font-medium">本地日志保存位置</span>
                <span className="text-xs text-on-surface-variant max-w-full break-all leading-snug">
                  {getVaultDescription()}
                </span>
              </div>
              <button
                onClick={handleChooseVaultDirectory}
                className="shrink-0 min-w-[56px] px-3 py-1.5 rounded-full bg-primary text-white text-sm font-medium active:scale-95 transition-transform"
              >
                {vaultStatus?.available ? '重新选择' : '选择'}
              </button>
            </div>
            <button
              onClick={handleRestoreFromVault}
              className="w-full flex items-center justify-between px-5 py-4 active:bg-surface-container-low transition-colors"
            >
              <span className="text-[15px] font-medium">手动从本地文件夹同步</span>
              <ChevronRight className="w-5 h-5 text-outline-variant" />
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="导入导出" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <button onClick={() => handleExport('markdown')} className="w-full flex items-center justify-between px-5 py-4 border-b border-surface-container/50 active:bg-surface-container-low transition-colors">
              <span className="text-[15px] font-medium">导出日记</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-on-surface-variant">Markdown</span>
                <ChevronRight className="w-5 h-5 text-outline-variant" />
              </div>
            </button>
            <button onClick={() => setActiveSheet('import')} className="w-full flex items-center justify-between px-5 py-4 active:bg-surface-container-low transition-colors">
              <span className="text-[15px] font-medium">导入备份</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-on-surface-variant">Markdown</span>
                <ChevronRight className="w-5 h-5 text-outline-variant" />
              </div>
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="反馈与帮助" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <button onClick={() => { setFeedbackType('problem'); setActiveSheet('feedback'); }} className="w-full flex items-center justify-between px-5 py-4 border-b border-surface-container/50 active:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-primary" />
                <span className="text-[15px] font-medium">问题反馈</span>
              </div>
              <ChevronRight className="w-5 h-5 text-outline-variant" />
            </button>
            <button onClick={() => { setFeedbackType('suggestion'); setActiveSheet('feedback'); }} className="w-full flex items-center justify-between px-5 py-4 active:bg-surface-container-low transition-colors">
              <div className="flex items-center gap-3">
                <Lightbulb className="w-5 h-5 text-primary" />
                <span className="text-[15px] font-medium">功能建议</span>
              </div>
              <ChevronRight className="w-5 h-5 text-outline-variant" />
            </button>
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle title="协议条款" />
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden">
            <Link to="/terms" className="w-full flex items-center justify-between px-5 py-4 border-b border-surface-container/50 active:bg-surface-container-low transition-colors">
              <span className="text-[15px] font-medium">用户协议</span>
              <ChevronRight className="w-5 h-5 text-outline-variant" />
            </Link>
            <Link to="/privacy" className="w-full flex items-center justify-between px-5 py-4 active:bg-surface-container-low transition-colors">
              <span className="text-[15px] font-medium">隐私政策</span>
              <ChevronRight className="w-5 h-5 text-outline-variant" />
            </Link>
          </div>
        </section>

        <section className="pt-4">
          <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_20px_rgba(47,52,46,0.02)] overflow-hidden border border-error/20">
            <button
              onClick={() => setActiveSheet('deleteAccount')}
              className="w-full flex items-center justify-center px-5 py-4 text-error active:bg-error/5 transition-colors"
            >
              <span className="text-[15px] font-medium">注销账号</span>
            </button>
          </div>
        </section>
      </main>

      <BottomSheet isOpen={activeSheet === 'time'} onClose={() => setActiveSheet(null)} title="提醒时间">
        <div className="flex flex-col items-center py-4">
          <input
            type="time"
            value={settings.reminderTime}
            onChange={(event) => handleReminderTimeChange(event.target.value)}
            className="text-4xl font-bold bg-transparent border-none outline-none text-center text-primary"
          />
          <button
            onClick={() => setActiveSheet(null)}
            className="mt-8 w-full py-3 bg-primary text-white rounded-xl font-medium active:scale-95 transition-transform"
          >
            完成
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'notificationPermission'} onClose={() => setActiveSheet(null)} title="开启通知权限">
        <div className="flex flex-col gap-4 py-2">
          <div className="rounded-2xl bg-surface-container-lowest px-4 py-4 text-sm leading-6 text-on-surface-variant">
            <p className="font-medium text-on-surface">需要先允许系统通知，才能开启{permissionFeatureName}。</p>
            <p className="mt-2">如果刚才没有弹出授权框，通常是系统或浏览器已经拦截过通知权限，请进入权限设置后把“通知”改为允许。</p>
          </div>
          <button
            onClick={handleOpenNotificationSettings}
            className="w-full py-3 bg-primary text-white rounded-xl font-medium active:scale-95 transition-transform"
          >
            打开权限设置
          </button>
          <button
            onClick={async () => {
              const permission = await requestBrowserNotificationPermission();
              if (permission === 'granted') {
                applyPendingNotificationToggle(pendingNotificationToggle);
                if (pendingNotificationToggle?.type === 'reminder') {
                  await scheduleDailyReminder(settings.reminderTime, REMINDER_NOTIFICATION_TITLE, REMINDER_NOTIFICATION_BODY)
                    .catch(error => console.warn('Schedule reminder failed:', error));
                }
                setPendingNotificationToggle(null);
                setActiveSheet(null);
                showToast('通知权限已开启');
              } else if (permission === 'denied') {
                showToast('仍未允许通知权限');
              } else if (permission === 'insecure') {
                showToast(getNotificationUnavailableReason() || '当前地址无法开启通知权限');
              } else {
                showToast(getNotificationUnavailableReason() || '请在弹出的授权框中选择允许');
              }
            }}
            className="w-full py-3 bg-surface-container-low text-on-surface rounded-xl font-medium active:scale-95 transition-transform"
          >
            重新申请权限
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'import'} onClose={() => setActiveSheet(null)} title="导入备份">
        <div className="flex flex-col items-center py-4 text-center">
          <div className="text-on-surface-variant mb-6 text-sm text-left w-full space-y-2">
            <p>支持导入 Markdown 格式 (.md) 的备份文件。请根据文件情况选择：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>普通导入</strong>：适合日志格式整齐、日期规律的文件，速度较快。</li>
              <li><strong>智能解析</strong>：适合时间线较复杂的日记，采用 AI 精准提取切分，但耗时较长。</li>
            </ul>
          </div>
          <div className="flex flex-col gap-3 w-full">
            <button
              onClick={() => handleImport(false)}
              className="w-full py-3 bg-surface-container-high text-on-surface rounded-xl font-medium active:scale-95 transition-transform"
            >
              普通导入
            </button>
            <button
              onClick={() => handleImport(true)}
              className="w-full py-3 bg-primary text-white rounded-xl font-medium active:scale-95 transition-transform flex items-center justify-center gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              智能解析导入
            </button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'feedback'} onClose={() => setActiveSheet(null)} title={feedbackType === 'problem' ? '问题反馈' : '功能建议'}>
        <div className="flex flex-col gap-4">
          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder={feedbackType === 'problem' ? '请描述你遇到的问题...' : '写下你的建议...'}
            className="w-full h-40 p-4 rounded-xl bg-surface-container-lowest border border-surface-container-high focus:border-primary outline-none resize-none text-[15px]"
          />
          <button
            onClick={submitFeedback}
            disabled={!feedbackText.trim()}
            className="w-full py-3 bg-primary text-white rounded-xl font-medium active:scale-95 transition-transform disabled:opacity-50"
          >
            发送反馈
          </button>
        </div>
      </BottomSheet>

      <BottomSheet isOpen={activeSheet === 'deleteAccount'} onClose={() => setActiveSheet(null)} title="注销账号">
        <div className="flex flex-col gap-4 py-4">
          <div className="text-on-surface-variant text-[15px] text-left w-full space-y-2">
            <p className="text-error font-bold">此操作不可恢复。</p>
            <p>注销后会删除你的账号以及相关用户数据，包括日记、好友和通知等内容。</p>
          </div>
          <button
            onClick={handleDeleteAccount}
            className="w-full py-3 bg-error text-white rounded-xl font-medium active:scale-95 transition-transform"
          >
            确认注销并删除数据
          </button>
          <button
            onClick={() => setActiveSheet(null)}
            className="w-full py-3 bg-surface-container-low text-on-surface rounded-xl font-medium active:scale-95 transition-transform"
          >
            取消
          </button>
        </div>
      </BottomSheet>

      {importData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6">
          <div className="bg-surface w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <h3 className="font-headline font-bold text-xl text-on-surface">导入确认</h3>
              <div className="space-y-2 text-on-surface-variant text-sm">
                <p>识别到 <span className="text-primary font-bold">{importData.length}</span> 篇日记</p>
                <p>时间范围：{getImportDateRange()}</p>
                <p className="text-on-surface font-medium">是否全部导入？</p>
              </div>

              {importData.some((entry) => entry.dateUncertain) && (
                <div className="mt-4 pt-4 border-t border-surface-container-high space-y-3 max-h-[45vh] overflow-y-auto pr-2">
                  <p className="text-on-surface font-medium">以下日期不确定，可手动调整或跳过：</p>
                  {importData.filter((entry) => entry.dateUncertain).map((entry) => (
                    <div key={`${entry.title}-${entry.content.slice(0, 20)}`} className={`p-3 rounded-xl border ${entry.skip ? 'opacity-50 grayscale' : ''} ${entry.dateSource === 'fallback' ? 'border-error/30 bg-error/5' : 'border-primary/30 bg-primary/5'}`}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-medium text-on-surface truncate" title={entry.content}>{entry.title || '未命名日记'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${entry.dateSource === 'fallback' ? 'bg-error text-white' : 'bg-primary/20 text-primary'}`}>
                          {entry.dateSource === 'ai' ? 'AI识别' : entry.dateSource === 'fallback' ? '需确认' : '已解析'}
                        </span>
                      </div>
                      <div className="text-xs text-on-surface-variant mb-3 line-clamp-2" title={entry.content}>
                        {entry.content}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="date"
                          className="bg-surface border border-outline/30 rounded px-2 py-1 flex-1 text-sm text-on-surface outline-none focus:border-primary"
                          value={entry.date || ''}
                          onChange={(event) => {
                            const newData = importData.map((item) =>
                              item === entry ? { ...item, date: event.target.value, dateSource: 'manual' as const } : item,
                            );
                            setImportData(newData);
                          }}
                        />
                        <label className="flex items-center text-xs shrink-0 gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!entry.skip}
                            onChange={(event) => {
                              const newData = importData.map((item) =>
                                item === entry ? { ...item, skip: event.target.checked } : item,
                              );
                              setImportData(newData);
                            }}
                          />
                          跳过
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setImportData(null)}
                  className="flex-1 py-3 rounded-xl font-medium text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={confirmImport}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-medium active:scale-95 transition-transform"
                >
                  全部导入
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSheet === 'fontSettings' && (
        <div className="fixed inset-0 z-[100] bg-surface flex flex-col animate-in slide-in-from-bottom duration-300">
          <header className="app-safe-header flex items-center px-4 border-b border-surface-container-high/50 flex-shrink-0 relative justify-between">
            <button
              onClick={() => setActiveSheet(null)}
              className="flex items-center justify-center rounded-[12px] transition-colors duration-300 bg-transparent active:bg-[rgba(0,0,0,0.06)] dark:active:bg-[rgba(255,255,255,0.08)] text-[#1C1C1E] dark:text-[#F2F2F7] shrink-0 relative z-10"
              style={{ width: '40px', height: '40px' }}
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <button
              onClick={() => handleFontSettingsChange({ fontFamily: 'noto-sans', fontSize: 16, lineHeight: 1.7 })}
              className="text-[15px] font-medium text-on-surface-variant z-10"
            >
              恢复默认
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6 bg-surface">
            <div
              style={{
                fontFamily: 'var(--diary-font-family)',
                fontSize: 'var(--diary-font-size)',
                lineHeight: 'var(--diary-line-height)',
                color: 'inherit',
              }}
              className="text-on-surface pb-10"
            >
              <h2 style={{ fontSize: '1.25em', fontWeight: 600, marginTop: '1.2rem', marginBottom: '0.5rem' }}>字体预览</h2>
              <p style={{ margin: 0 }}>这是一段日记字体预览文字。你可以在下方调整字体、字号和行高，找到最适合书写的阅读节奏。</p>
              <p style={{ margin: 0, marginTop: '1.2rem', fontWeight: 600 }}>今日小记</p>
              <p style={{ margin: 0 }}>把普通的一天写下来，它就有了被重新遇见的机会。</p>
            </div>
          </div>

          <div className="flex-shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
            <FontToolbar fontSettings={fontSettings} onChange={handleFontSettingsChange} />
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <div className="w-0.5 h-4 bg-primary rounded-full" />
      <h3 className="text-xs font-bold tracking-widest text-on-surface-variant uppercase">{title}</h3>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, FolderOpen, Loader2, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { diaryService } from '../services/diaryService';
import { firstInstallVaultOnboardingService } from '../services/firstInstallVaultOnboardingService';
import { localVaultService, VaultCapability, VaultStatus } from '../services/localVaultService';

type BusyState = 'idle' | 'choosing' | 'syncing';

export default function FirstRunVaultOnboarding() {
  const navigate = useNavigate();
  const [capability] = useState<VaultCapability>(() => localVaultService.getVaultCapability());
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [busyState, setBusyState] = useState<BusyState>('idle');
  const [message, setMessage] = useState('');

  const canChooseDirectory = capability.mode === 'directory-sync';
  const isBusy = busyState !== 'idle';

  const supportText = useMemo(() => {
    if (capability.mode === 'directory-sync') {
      return '选择后，小象日志会把本地日记保存到这个文件夹。以后也可以在设置里重新选择。';
    }
    if (capability.mode === 'archive-download') {
      return '当前环境暂时不能直接授权文件夹。你可以先继续使用，之后在设置里生成本地日志包。';
    }
    return capability.reason || '当前环境暂时不能选择本地文件夹，可以先继续使用小象日志。';
  }, [capability]);

  useEffect(() => {
    const state = firstInstallVaultOnboardingService.getState();
    if (state && !firstInstallVaultOnboardingService.shouldShow()) {
      navigate('/', { replace: true });
      return;
    }

    localVaultService.getVaultStatus()
      .then(setVaultStatus)
      .catch(error => console.warn('Failed to read local vault status on first run:', error));
  }, [navigate]);

  const finish = () => {
    navigate('/', { replace: true });
  };

  const handleSkip = () => {
    firstInstallVaultOnboardingService.skip();
    finish();
  };

  const handleChooseDirectory = async () => {
    if (!canChooseDirectory || isBusy) return;

    setMessage('');
    setBusyState('choosing');
    try {
      const status = await localVaultService.chooseVaultDirectory();
      setVaultStatus(status);

      if (!status.available) {
        setMessage(status.unavailableReason || '文件夹授权没有完成，可以稍后再试。');
        return;
      }

      setBusyState('syncing');
      await diaryService.syncAllEntriesToVault().catch(error => {
        console.warn('Failed to sync existing entries during first run vault onboarding:', error);
      });
      firstInstallVaultOnboardingService.complete();
      finish();
    } catch (error: any) {
      console.warn('Failed to choose local vault directory on first run:', error);
      setMessage(error?.message || '选择文件夹失败，可以稍后在设置里重新选择。');
    } finally {
      setBusyState('idle');
    }
  };

  const handleContinueUnsupported = () => {
    firstInstallVaultOnboardingService.skip();
    finish();
  };

  return (
    <div className="min-h-dvh bg-[#FAF9F5] text-[#1C1C1E] font-sans">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pb-[calc(28px+var(--app-safe-bottom))] pt-[calc(28px+var(--app-safe-top))]">
        <div className="flex flex-1 flex-col justify-center">
          <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#EEF5E8] text-[#446733] shadow-[0_12px_32px_rgba(68,103,51,0.12)]">
            <FolderOpen className="h-10 w-10" />
          </div>

          <p className="mb-3 text-sm font-medium text-[#446733]">第一次使用前</p>
          <h1 className="mb-4 text-[30px] font-bold leading-tight tracking-normal">
            选择本地日志保存位置
          </h1>
          <p className="mb-8 text-[15px] leading-7 text-[#6E6E73]">
            小象日志会优先把你的文字留在本地。你可以选择一个自己熟悉的文件夹，用来保存日记文件和图片附件。
          </p>

          <div className="mb-8 space-y-3 rounded-[22px] bg-white/80 p-4 shadow-[0_10px_34px_rgba(47,52,46,0.06)] ring-1 ring-black/5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#446733]" />
              <div>
                <div className="text-[15px] font-semibold">只用于保存你的本地日志</div>
                <p className="mt-1 text-sm leading-6 text-[#6E6E73]">
                  {supportText}
                </p>
              </div>
            </div>
            {vaultStatus?.available && (
              <div className="flex gap-3 rounded-2xl bg-[#EEF5E8] px-3 py-2 text-[#446733]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="min-w-0 text-sm leading-6">
                  已选择：<span className="break-all font-medium">{vaultStatus.displayPath || '本地日志文件夹'}</span>
                </div>
              </div>
            )}
          </div>

          {message && (
            <div className="mb-4 rounded-2xl bg-[#FFF3E8] px-4 py-3 text-sm leading-6 text-[#8A4B1D]">
              {message}
            </div>
          )}
        </div>

        <div className="grid gap-3">
          {canChooseDirectory ? (
            <button
              type="button"
              onClick={handleChooseDirectory}
              disabled={isBusy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#446733] text-[16px] font-semibold text-white shadow-[0_14px_32px_rgba(68,103,51,0.22)] transition-transform active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
            >
              {isBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <FolderOpen className="h-5 w-5" />}
              {busyState === 'syncing' ? '正在准备本地保存' : busyState === 'choosing' ? '正在选择文件夹' : '选择文件夹'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleContinueUnsupported}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#446733] text-[16px] font-semibold text-white shadow-[0_14px_32px_rgba(68,103,51,0.22)] transition-transform active:scale-[0.98]"
            >
              继续使用
              <ArrowRight className="h-5 w-5" />
            </button>
          )}

          <button
            type="button"
            onClick={handleSkip}
            disabled={isBusy}
            className="h-14 w-full rounded-[18px] bg-white/80 text-[15px] font-medium text-[#6E6E73] shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            稍后在设置里选择
          </button>
        </div>
      </main>
    </div>
  );
}

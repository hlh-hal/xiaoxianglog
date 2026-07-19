import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, LogOut, MessageCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';
import { uploadImages } from '../services/apiClient';
import { UserAvatar } from '../components/UserAvatar';
import { wechatAuthService, type WechatConfig } from '../services/wechatAuthService';

const LEGACY_DEFAULT_AVATAR_URL = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCLrgyJjoLOhXcdpz-ATOd8-V3r4KJzkUQ8jxVRvevVMC3A6pTnkZGdzP3HsDKANHbREyg4hzW3lFTQQQUGlaWYDLdS36DO-lLNL5qLfTu_mrBz0UfsXxUHeJFcM6r3iByBMnldeR0sv_NRA3lXCikSRr41q2e7zEghDtjsn7OOXEeljufixUqDDS0C1gFPnZMzIjhHvxFbX2nE8L6vLiFcEiOZvaVrv54xBeawd88O1xCh6gKQENXA4OkVICYsxHYBPlyEtXLHO6s';
const LEGACY_DEFAULT_BIOS = new Set(['用文字滋养正念。', '鐢ㄦ枃瀛楁粙鍏绘蹇点€?']);

const normalizeBio = (bio?: string | null) => {
  const value = bio || '';
  return LEGACY_DEFAULT_BIOS.has(value.trim()) ? '' : value;
};

const normalizeAvatarUrl = (avatarUrl?: string | null) => {
  return avatarUrl === LEGACY_DEFAULT_AVATAR_URL ? '' : (avatarUrl || '');
};

const isEmbeddedAvatar = (value?: string | null) => {
  return !!value && /^data:/i.test(value);
};

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('图片压缩失败'));
    }, type, quality);
  });
}

async function compressAvatarImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件');
  }

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = sourceUrl;
    await image.decode();

    const maxSize = 512;
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('图片压缩失败');

    context.drawImage(image, 0, 0, width, height);
    const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function EditProfile() {
  const navigate = useNavigate();
  const { user, updateUser, logout, deleteAccount } = useAuth();

  const [nickname, setNickname] = useState(user?.nickname || '');
  const [bio, setBio] = useState(normalizeBio(user?.bio));
  const [avatarUrl, setAvatarUrl] = useState(normalizeAvatarUrl(user?.avatarUrl));
  const [wechatConfig, setWechatConfig] = useState<WechatConfig | null>(null);
  const [wechatBound, setWechatBound] = useState(false);
  const [wechatAction, setWechatAction] = useState<'link' | 'unlink' | null>(null);
  const [wechatEmailCode, setWechatEmailCode] = useState('');
  const [wechatMessage, setWechatMessage] = useState('');
  const [wechatError, setWechatError] = useState('');
  const [wechatBusy, setWechatBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    setNickname(user.nickname || '');
    setBio(normalizeBio(user.bio));
    setAvatarUrl(normalizeAvatarUrl(user.avatarUrl));
  }, [user?.userId]);

  useEffect(() => {
    if (!user || !wechatAuthService.isAndroidNative()) return;
    let cancelled = false;
    Promise.all([wechatAuthService.getConfig(), wechatAuthService.getBinding()])
      .then(([config, binding]) => {
        if (cancelled || !config.enabled) return;
        setWechatConfig(config);
        setWechatBound(binding.bound);
      })
      .catch((error) => {
        if (!cancelled) console.warn('读取微信绑定状态失败:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  useEffect(() => {
    if (!user) return;

    const timeoutProcess = setTimeout(async () => {
      const nextAvatarUrl = avatarUrl.trim();
      const nextProfile = {
        nickname: nickname.trim() || user.nickname,
        bio: bio.trim(),
        avatarUrl: isEmbeddedAvatar(nextAvatarUrl) ? '' : nextAvatarUrl,
      };

      const currentBio = normalizeBio(user.bio).trim();
      const currentAvatarUrl = normalizeAvatarUrl(user.avatarUrl).trim();
      const hasChanges =
        nextProfile.nickname !== user.nickname ||
        nextProfile.bio !== currentBio ||
        nextProfile.avatarUrl !== currentAvatarUrl;

      if (!hasChanges) return;

      try {
        const updated = await authService.updateProfile(nextProfile);
        updateUser(updated);
      } catch (e) {
        console.error('自动保存失败', e);
      }
    }, 800);

    return () => clearTimeout(timeoutProcess);
  }, [nickname, bio, avatarUrl, user, updateUser]);

  if (!user) {
    return null;
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleDeleteAccount = async () => {
    const confirmDelete = window.confirm('注销账号将永久删除所有数据，确定要继续吗？');
    if (confirmDelete) {
      try {
        await deleteAccount();
        navigate('/login', { replace: true });
      } catch (e) {
        alert('注销失败');
      }
    }
  };

  const handleChangeAvatar = () => {
    fileInputRef.current?.click();
  };

  const beginWechatVerification = async (action: 'link' | 'unlink') => {
    if (!wechatConfig) return;
    setWechatBusy(true);
    setWechatError('');
    setWechatMessage('');
    try {
      if (action === 'link') await wechatAuthService.ensureInstalled(wechatConfig);
      const result = await wechatAuthService.requestBindingEmailCode(action);
      setWechatAction(action);
      setWechatEmailCode('');
      setWechatMessage(result.devCode
        ? `开发环境验证码：${result.devCode}`
        : `验证码已发送到 ${user.email}`);
    } catch (error: any) {
      setWechatError(error?.message || '验证码发送失败，请稍后重试');
    } finally {
      setWechatBusy(false);
    }
  };

  const confirmWechatAction = async () => {
    if (!wechatAction || !wechatConfig || !/^\d{6}$/.test(wechatEmailCode)) {
      setWechatError('请输入邮箱收到的 6 位验证码');
      return;
    }
    setWechatBusy(true);
    setWechatError('');
    try {
      if (wechatAction === 'link') {
        await wechatAuthService.link(wechatConfig, wechatEmailCode);
        setWechatBound(true);
        setWechatMessage('微信绑定成功，以后可以直接使用微信登录');
      } else {
        await wechatAuthService.unlink(wechatEmailCode);
        setWechatBound(false);
        setWechatMessage('微信绑定已解除，邮箱登录不受影响');
      }
      setWechatAction(null);
      setWechatEmailCode('');
    } catch (error: any) {
      setWechatError(error?.message || '微信账号操作失败，请稍后重试');
    } finally {
      setWechatBusy(false);
    }
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const uploadFile = await compressAvatarImage(file);
        const urls = await uploadImages([uploadFile]);
        if (urls.length > 0) {
          setAvatarUrl(urls[0]);
          const updated = await authService.updateProfile({ avatarUrl: urls[0], nickname, bio });
          updateUser(updated);
        }
      } catch (error) {
        console.error('头像上传失败:', error);
        alert(error instanceof Error ? error.message : '头像上传失败，请稍后再试');
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col font-sans">
      <header className="app-safe-header sticky top-0 z-10 flex items-center justify-between px-6 bg-surface/80 backdrop-blur-md">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-full active:bg-black/5 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-on-surface" />
        </button>
        <span className="font-bold text-lg absolute left-1/2 -translate-x-1/2">个人信息</span>
      </header>

      <main className="flex-1 px-6 py-6 pb-20 flex flex-col gap-6">
        <section className="flex flex-col items-center gap-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleAvatarFileChange}
            accept="image/*"
            className="hidden"
          />
          <div onClick={handleChangeAvatar} className="cursor-pointer active:scale-95 transition-transform">
            <UserAvatar
              userId={user?.userId}
              src={avatarUrl}
              name={nickname || user?.nickname || '我'}
              preferCurrentUserAvatar={false}
              className="w-24 h-24 rounded-full shrink-0 ring-4 ring-surface-container-high shadow-lg"
              fallbackClassName="bg-surface-container-high flex items-center justify-center text-outline"
            />
          </div>
        </section>

        <section className="bg-surface-container-lowest/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden divide-y divide-outline-variant/10">
          <div className="px-5 py-4 flex flex-col gap-2">
            <label className="text-[12px] font-medium text-outline uppercase tracking-wider">昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="w-full bg-transparent text-[16px] font-semibold text-on-surface outline-none placeholder:text-outline/50"
              placeholder="请输入昵称"
            />
          </div>
          <div className="px-5 py-4 flex flex-col gap-2">
            <label className="text-[12px] font-medium text-outline uppercase tracking-wider">个性签名</label>
            <input
              type="text"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-transparent text-[16px] text-on-surface outline-none placeholder:text-outline/50"
              placeholder="还没有个性签名"
            />
          </div>
          <div className="px-5 py-4 flex flex-col gap-2">
            <label className="text-[12px] font-medium text-outline uppercase tracking-wider">邮箱</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full bg-transparent text-[16px] text-outline outline-none cursor-not-allowed"
            />
          </div>
        </section>

        {wechatConfig && (
          <section className="bg-surface-container-lowest/60 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden border border-outline-variant/10">
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#07C160]/10 text-[#16843D] flex items-center justify-center shrink-0">
                <MessageCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-on-surface">微信登录</p>
                <p className="text-[12px] text-outline mt-0.5">
                  {wechatBound ? '已绑定到当前邮箱账号' : '绑定后可用微信登录同一个账号'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => beginWechatVerification(wechatBound ? 'unlink' : 'link')}
                disabled={wechatBusy}
                className={`px-3.5 h-9 rounded-xl text-sm font-medium disabled:opacity-50 ${wechatBound ? 'bg-error-container/30 text-error' : 'bg-[#07C160]/10 text-[#16843D]'}`}
              >
                {wechatBusy && !wechatAction ? <Loader2 className="w-4 h-4 animate-spin" /> : (wechatBound ? '解除绑定' : '绑定微信')}
              </button>
            </div>

            {wechatAction && (
              <div className="border-t border-outline-variant/10 px-5 py-4 bg-surface-container-low/40">
                <p className="text-[13px] text-on-surface-variant mb-3">
                  {wechatAction === 'link'
                    ? '先验证当前账号邮箱，确认后会打开微信授权。'
                    : '验证当前账号邮箱后解除绑定，日记和邮箱登录不会被删除。'}
                </p>
                <div className="flex gap-2">
                  <input
                    value={wechatEmailCode}
                    onChange={event => setWechatEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    placeholder="6 位邮箱验证码"
                    className="h-11 flex-1 min-w-0 px-3 rounded-xl bg-surface border border-outline-variant/30 outline-none focus:border-primary text-[15px]"
                  />
                  <button
                    type="button"
                    onClick={confirmWechatAction}
                    disabled={wechatBusy}
                    className="h-11 px-4 rounded-xl bg-primary text-white text-sm font-medium disabled:opacity-50"
                  >
                    {wechatBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : '确认'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWechatAction(null);
                      setWechatEmailCode('');
                      setWechatError('');
                    }}
                    disabled={wechatBusy}
                    className="h-11 px-3 rounded-xl text-outline text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {(wechatMessage || wechatError) && (
              <p className={`px-5 pb-4 text-[12px] ${wechatError ? 'text-error' : 'text-[#446733]'}`}>
                {wechatError || wechatMessage}
              </p>
            )}
          </section>
        )}

        <section className="mt-8 flex flex-col gap-3">
          <button
            onClick={handleLogout}
            className="w-full bg-surface-container-lowest/60 hover:bg-surface-container-low active:bg-surface-container shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] border border-outline-variant/10 h-14 rounded-[16px] flex items-center justify-center gap-2 text-on-surface font-medium transition-all duration-300"
          >
            <LogOut className="w-5 h-5 text-outline" />
            退出登录
          </button>
          <button
            onClick={handleDeleteAccount}
            className="w-full bg-error-container/20 hover:bg-error-container/40 h-14 rounded-[16px] flex items-center justify-center gap-2 text-error font-medium transition-all duration-300"
          >
            <Trash2 className="w-5 h-5" />
            注销账号
          </button>
        </section>
      </main>
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authService } from '../services/authService';
import { uploadImages } from '../services/apiClient';
import { UserAvatar } from '../components/UserAvatar';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;

    setNickname(user.nickname || '');
    setBio(normalizeBio(user.bio));
    setAvatarUrl(normalizeAvatarUrl(user.avatarUrl));
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

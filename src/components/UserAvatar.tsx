import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { useOptionalAuth } from '../contexts/AuthContext';
import { resolveMediaUrl } from '../utils/media';
import { SafeImage } from './SafeImage';

type UserAvatarProps = {
  userId?: string | null;
  src?: string | null;
  name?: string | null;
  preferCurrentUserAvatar?: boolean;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
};

export function UserAvatar({
  userId,
  src,
  name,
  preferCurrentUserAvatar = true,
  className = 'w-10 h-10 rounded-full',
  imageClassName = 'w-full h-full object-cover',
  fallbackClassName = 'bg-surface-container flex items-center justify-center text-outline',
  alt,
}: UserAvatarProps) {
  const auth = useOptionalAuth();
  const user = auth?.user;
  const isCurrentUser = !!userId && user?.userId === userId;
  const effectiveSrc = isCurrentUser && preferCurrentUserAvatar ? (user?.avatarUrl || src) : src;
  const effectiveName = isCurrentUser ? (user?.nickname || name) : name;
  const imageUrl = resolveMediaUrl(effectiveSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div className={`${className} overflow-hidden shrink-0 ${!imageUrl || failed ? fallbackClassName : ''}`}>
      {imageUrl && !failed ? (
        <SafeImage
          src={imageUrl}
          alt={alt || effectiveName || 'Avatar'}
          className={imageClassName}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : effectiveName ? (
        <span className="text-sm font-medium">{effectiveName.slice(0, 1)}</span>
      ) : (
        <User className="w-1/2 h-1/2" />
      )}
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { resolveMediaUrl } from '../utils/media';

type UserAvatarProps = {
  src?: string | null;
  name?: string | null;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  alt?: string;
};

export function UserAvatar({
  src,
  name,
  className = 'w-10 h-10 rounded-full',
  imageClassName = 'w-full h-full object-cover',
  fallbackClassName = 'bg-surface-container flex items-center justify-center text-outline',
  alt,
}: UserAvatarProps) {
  const imageUrl = resolveMediaUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  return (
    <div className={`${className} overflow-hidden shrink-0 ${!imageUrl || failed ? fallbackClassName : ''}`}>
      {imageUrl && !failed ? (
        <img
          src={imageUrl}
          alt={alt || name || 'Avatar'}
          className={imageClassName}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : name ? (
        <span className="text-sm font-medium">{name.slice(0, 1)}</span>
      ) : (
        <User className="w-1/2 h-1/2" />
      )}
    </div>
  );
}

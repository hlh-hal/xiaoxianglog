import React, { useEffect, useState } from 'react';
import { dataImageUrlToBlobUrl, resolveMediaUrl } from '../utils/media';

type SafeImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string | null;
};

export function SafeImage({ src, alt = '', ...props }: SafeImageProps) {
  const [displaySrc, setDisplaySrc] = useState('');

  useEffect(() => {
    if (!src) {
      setDisplaySrc('');
      return;
    }

    if (!src.trim().startsWith('data:image/')) {
      setDisplaySrc(resolveMediaUrl(src));
      return;
    }

    const objectUrl = dataImageUrlToBlobUrl(src);
    setDisplaySrc(objectUrl || '');
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  if (!displaySrc) {
    return <div aria-hidden="true" className={props.className} style={props.style as React.CSSProperties} />;
  }

  return <img {...props} src={displaySrc} alt={alt} />;
}

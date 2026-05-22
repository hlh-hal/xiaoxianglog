import React, { useEffect, useState } from 'react';
import { dataImageUrlToBlobUrl, resolveMediaUrl } from '../utils/media';

type SafeImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src?: string | null;
};

function getDisplaySrc(src?: string | null): string {
  if (!src) return '';

  if (!src.trim().startsWith('data:image/')) {
    return resolveMediaUrl(src);
  }

  return dataImageUrlToBlobUrl(src) || '';
}

export function SafeImage({ src, alt = '', ...props }: SafeImageProps) {
  const [displaySrc, setDisplaySrc] = useState(() => getDisplaySrc(src));

  useEffect(() => {
    setDisplaySrc(getDisplaySrc(src));
  }, [src]);

  if (!displaySrc) {
    return <div aria-hidden="true" className={props.className} style={props.style as React.CSSProperties} />;
  }

  return <img {...props} src={displaySrc} alt={alt} />;
}

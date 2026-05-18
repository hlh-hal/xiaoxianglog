export function resolveMediaUrl(url?: string | null): string {
  const value = normalizeImageDataUrl((url || '').trim());
  if (!value) return '';

  if (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    /^https?:\/\//i.test(value)
  ) {
    return value;
  }

  if (value.startsWith('/api/uploads/')) return value;
  if (value.startsWith('api/uploads/')) return `/${value}`;
  if (value.startsWith('/uploads/')) return `/api${value}`;
  if (value.startsWith('uploads/')) return `/api/${value}`;

  return value.startsWith('/') ? value : `/${value}`;
}

export function normalizeImageDataUrl(url?: string | null): string {
  const value = (url || '').trim();
  if (!value || !value.startsWith('data:image/')) return value;
  return value
    .replace(/^data:(image\/[^;,]+);base,/i, 'data:$1;base64,')
    .replace(/^data:(image\/[^;,]+);base64;/i, 'data:$1;base64,');
}

export function dataImageUrlToBlobUrl(url?: string | null): string | null {
  const value = normalizeImageDataUrl(url);
  const match = value.match(/^data:(image\/[^;,]+);base64,(.+)$/i);
  if (!match) return null;

  try {
    const mimeType = match[1];
    const base64 = match[2].replace(/\s/g, '');
    const binary = atob(base64);
    const chunkSize = 8192;
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < binary.length; offset += chunkSize) {
      const slice = binary.slice(offset, offset + chunkSize);
      const bytes = new Uint8Array(slice.length);
      for (let i = 0; i < slice.length; i += 1) {
        bytes[i] = slice.charCodeAt(i);
      }
      chunks.push(bytes);
    }
    return URL.createObjectURL(new Blob(chunks, { type: mimeType }));
  } catch {
    return null;
  }
}

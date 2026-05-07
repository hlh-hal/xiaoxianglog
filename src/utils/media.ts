export function resolveMediaUrl(url?: string | null): string {
  const value = (url || '').trim();
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

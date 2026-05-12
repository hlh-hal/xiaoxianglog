import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import OSS from 'ali-oss';

type StoredTarget =
  | { kind: 'oss'; key: string }
  | { kind: 'local'; filePath: string };

const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
const ossEndpoint = process.env.OSS_ENDPOINT?.trim();
const ossBucket = process.env.OSS_BUCKET?.trim();
const ossAccessKeyId = process.env.OSS_ACCESS_KEY_ID?.trim();
const ossAccessKeySecret = process.env.OSS_ACCESS_KEY_SECRET?.trim();
const ossPublicBaseUrl = process.env.OSS_PUBLIC_BASE_URL?.trim().replace(/\/$/, '');

function normalizeKey(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function defaultPublicBaseUrl(): string | null {
  if (!ossEndpoint || !ossBucket) return null;
  return `https://${ossBucket}.${stripProtocol(ossEndpoint)}`;
}

function getPublicBaseUrl(): string | null {
  return ossPublicBaseUrl || defaultPublicBaseUrl();
}

function getOssClient(): any | null {
  if (!ossEndpoint || !ossBucket || !ossAccessKeyId || !ossAccessKeySecret) return null;
  return new OSS({
    endpoint: ossEndpoint,
    accessKeyId: ossAccessKeyId,
    accessKeySecret: ossAccessKeySecret,
    bucket: ossBucket,
  });
}

const ossClient = getOssClient();

export function isOssEnabled(): boolean {
  return !!ossClient;
}

export function buildOssUrl(key: string): string {
  const base = getPublicBaseUrl();
  if (!base) {
    throw new Error('OSS is not configured');
  }
  return `${base}/${normalizeKey(key)}`;
}

export function getObjectKeyFromUrl(url?: string | null): string | null {
  if (!url || /^data:/i.test(url) || /^blob:/i.test(url)) return null;

  const normalizedUrl = url.replace(/\\/g, '/');
  const publicBase = getPublicBaseUrl();
  if (publicBase && normalizedUrl.startsWith(`${publicBase}/`)) {
    return decodeURIComponent(normalizedUrl.slice(publicBase.length + 1).split(/[?#]/)[0]);
  }

  if (ossBucket && ossEndpoint) {
    const bucketBase = `https://${ossBucket}.${stripProtocol(ossEndpoint)}/`;
    if (normalizedUrl.startsWith(bucketBase)) {
      return decodeURIComponent(normalizedUrl.slice(bucketBase.length).split(/[?#]/)[0]);
    }
  }

  return null;
}

export function getLocalUploadPathFromUrl(url?: string | null): string | null {
  if (!url || /^https?:\/\//i.test(url) || url.startsWith('data:')) return null;

  const normalized = url.replace(/\\/g, '/');
  let relativePath: string | null = null;

  if (normalized.startsWith('/api/uploads/')) {
    relativePath = normalized.slice('/api/uploads/'.length);
  } else if (normalized.startsWith('/uploads/')) {
    relativePath = normalized.slice('/uploads/'.length);
  } else if (normalized.startsWith('api/uploads/')) {
    relativePath = normalized.slice('api/uploads/'.length);
  } else if (normalized.startsWith('uploads/')) {
    relativePath = normalized.slice('uploads/'.length);
  }

  if (!relativePath) return null;

  const absolutePath = path.resolve(uploadRoot, decodeURIComponent(relativePath));
  if (!absolutePath.startsWith(uploadRoot + path.sep) && absolutePath !== uploadRoot) {
    return null;
  }

  return absolutePath;
}

export async function deleteStoredUrls(urls: Array<string | null | undefined>): Promise<void> {
  const seen = new Set<string>();
  const targets: StoredTarget[] = [];

  for (const url of urls) {
    const localPath = getLocalUploadPathFromUrl(url);
    if (localPath) {
      const key = `local:${localPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ kind: 'local', filePath: localPath });
      }
      continue;
    }

    const objectKey = getObjectKeyFromUrl(url);
    if (objectKey) {
      const key = `oss:${objectKey}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ kind: 'oss', key: objectKey });
      }
    }
  }

  await Promise.all(targets.map(async (target) => {
    if (target.kind === 'local') {
      try {
        await fs.unlink(target.filePath);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          console.warn('Delete local upload failed:', target.filePath, error);
        }
      }
      return;
    }

    if (!ossClient) return;
    try {
      await ossClient.delete(target.key);
    } catch (error) {
      console.warn('Delete OSS object failed:', target.key, error);
    }
  }));
}

function extensionFromName(name?: string): string {
  return path.extname(name || '').toLowerCase();
}

function extensionFromMime(mimeType?: string): string {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('png')) return '.png';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('webp')) return '.webp';
  if (mime.includes('heic')) return '.heic';
  if (mime.includes('woff2')) return '.woff2';
  if (mime.includes('woff')) return '.woff';
  if (mime.includes('opentype') || mime.includes('otf')) return '.otf';
  if (mime.includes('truetype') || mime.includes('ttf')) return '.ttf';
  return '';
}

function buildObjectKey(prefix: string, originalName?: string, mimeType?: string): string {
  const ext = extensionFromName(originalName) || extensionFromMime(mimeType);
  return normalizeKey(`${prefix}/${crypto.randomUUID()}${ext}`);
}

function buildLocalKey(prefix: string, originalName?: string, mimeType?: string): string {
  return buildObjectKey(prefix, originalName, mimeType);
}

async function uploadBuffer(prefix: string, buffer: Buffer, options: { originalName?: string; mimeType?: string }): Promise<{ url: string; key: string }> {
  if (!ossClient) {
    throw new Error('OSS is not configured');
  }

  const key = buildObjectKey(prefix, options.originalName, options.mimeType);
  await ossClient.put(key, buffer, {
    headers: options.mimeType ? { 'Content-Type': options.mimeType } : undefined,
  });
  return { key, url: buildOssUrl(key) };
}

export function uploadImageToOss(options: { buffer: Buffer; originalName?: string; mimeType?: string }) {
  return uploadBuffer('images', options.buffer, options);
}

export function uploadFontToOss(options: { buffer: Buffer; originalName?: string; mimeType?: string }) {
  return uploadBuffer('fonts', options.buffer, options);
}

export async function storeLocalUpload(
  prefix: string,
  options: { buffer: Buffer; originalName?: string; mimeType?: string },
): Promise<{ url: string; key: string; filePath: string }> {
  const key = buildLocalKey(prefix, options.originalName, options.mimeType);
  const filePath = path.join(uploadRoot, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, options.buffer);
  return {
    key,
    filePath,
    url: `/api/uploads/${key}`,
  };
}

import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import {
  currentVersion,
  currentVersionCode,
  latestRelease,
  updateManifestUrl,
  type AppRelease,
} from '../config/appRelease';

const PROMPTED_VERSION_KEY = 'xiang_update_notice_prompted_version';
const SKIPPED_VERSION_KEY = 'xiang_update_notice_skipped_version';

type RemoteRelease = Partial<AppRelease> & {
  versionName?: string;
  apkUrl?: string;
  changes?: string[];
};

type XiangUpdaterPlugin = {
  downloadAndInstall(options: { url: string; fileName?: string }): Promise<{
    status: 'install_started' | 'permission_required';
    path?: string;
    message?: string;
  }>;
};

const XiangUpdater = registerPlugin<XiangUpdaterPlugin>('XiangUpdater');

function parseVersion(version: string): number[] {
  return version
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .map(part => (Number.isFinite(part) ? part : 0));
}

function normalizeRelease(value: RemoteRelease): AppRelease {
  return {
    version: value.version || value.versionName || latestRelease.version,
    versionCode: Number.isFinite(value.versionCode) ? Number(value.versionCode) : latestRelease.versionCode,
    releasedAt: value.releasedAt || latestRelease.releasedAt,
    downloadUrl: value.downloadUrl || value.apkUrl || latestRelease.downloadUrl,
    highlights: Array.isArray(value.highlights)
      ? value.highlights
      : Array.isArray(value.changes)
        ? value.changes
        : latestRelease.highlights,
    fixes: Array.isArray(value.fixes) ? value.fixes : latestRelease.fixes,
  };
}

async function fetchReleaseWithBrowserFetch(url: string): Promise<RemoteRelease> {
  const response = await fetch(`${url}?_ts=${Date.now()}`, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
  if (!response.ok) throw new Error(`Update manifest HTTP ${response.status}`);
  return response.json();
}

async function fetchReleaseWithNativeHttp(url: string): Promise<RemoteRelease> {
  const separator = url.includes('?') ? '&' : '?';
  const response = await CapacitorHttp.get({
    url: `${url}${separator}_ts=${Date.now()}`,
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
    },
    responseType: 'json',
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Update manifest native HTTP ${response.status}`);
  }

  if (typeof response.data === 'string') {
    return JSON.parse(response.data);
  }

  return response.data as RemoteRelease;
}

export function compareVersions(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] || 0;
    const rightPart = right[index] || 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

export async function getLatestRelease(): Promise<AppRelease> {
  try {
    return normalizeRelease(await fetchReleaseWithBrowserFetch(updateManifestUrl));
  } catch (error) {
    if (Capacitor.isNativePlatform()) {
      try {
        return normalizeRelease(await fetchReleaseWithNativeHttp(updateManifestUrl));
      } catch (nativeError) {
        console.warn('Failed to fetch app update manifest with native HTTP, using bundled release info', nativeError);
      }
    } else {
      console.warn('Failed to fetch app update manifest, using bundled release info', error);
    }

    return latestRelease;
  }
}

export function hasAvailableUpdate(release = latestRelease): boolean {
  if (release.versionCode > currentVersionCode) return true;
  if (release.versionCode < currentVersionCode) return false;
  return compareVersions(release.version, currentVersion) > 0;
}

export function isReleaseSkipped(version = latestRelease.version): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SKIPPED_VERSION_KEY) === version;
}

export function shouldShowUpdateEntry(release = latestRelease): boolean {
  return hasAvailableUpdate(release);
}

export function shouldAutoOpenUpdateNotice(release = latestRelease): boolean {
  if (typeof window === 'undefined') return false;
  if (!hasAvailableUpdate(release)) return false;
  if (isReleaseSkipped(release.version)) return false;
  return localStorage.getItem(PROMPTED_VERSION_KEY) !== release.version;
}

export function markUpdateNoticePrompted(version = latestRelease.version): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROMPTED_VERSION_KEY, version);
}

export function skipRelease(version = latestRelease.version): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SKIPPED_VERSION_KEY, version);
  localStorage.setItem(PROMPTED_VERSION_KEY, version);
}

export function getConfiguredDownloadUrl(release = latestRelease): string | null {
  const url = release.downloadUrl.trim();
  return url.length > 0 ? url : null;
}

export async function downloadAndInstallApkUpdate(release = latestRelease): Promise<'install_started' | 'permission_required' | 'unavailable'> {
  const url = getConfiguredDownloadUrl(release);
  if (!url) return 'unavailable';

  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return 'unavailable';
  }

  const result = await XiangUpdater.downloadAndInstall({
    url,
    fileName: 'xiaoxiang-log-latest.apk',
  });

  return result.status;
}

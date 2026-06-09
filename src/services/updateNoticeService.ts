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
    const response = await fetch(`${updateManifestUrl}?_ts=${Date.now()}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
    if (!response.ok) throw new Error(`Update manifest HTTP ${response.status}`);
    return normalizeRelease(await response.json());
  } catch (error) {
    console.warn('Failed to fetch app update manifest, using bundled release info', error);
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

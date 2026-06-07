import { currentVersion, latestRelease } from '../config/appRelease';

const PROMPTED_VERSION_KEY = 'xiang_update_notice_prompted_version';
const SKIPPED_VERSION_KEY = 'xiang_update_notice_skipped_version';

function parseVersion(version: string): number[] {
  return version
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .map(part => (Number.isFinite(part) ? part : 0));
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

export function hasAvailableUpdate(): boolean {
  return compareVersions(latestRelease.version, currentVersion) > 0;
}

export function isReleaseSkipped(version = latestRelease.version): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(SKIPPED_VERSION_KEY) === version;
}

export function shouldShowUpdateEntry(): boolean {
  return hasAvailableUpdate() && !isReleaseSkipped();
}

export function shouldAutoOpenUpdateNotice(): boolean {
  if (typeof window === 'undefined') return false;
  if (!shouldShowUpdateEntry()) return false;
  return localStorage.getItem(PROMPTED_VERSION_KEY) !== latestRelease.version;
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

export function getConfiguredDownloadUrl(): string | null {
  const url = latestRelease.downloadUrl.trim();
  return url.length > 0 ? url : null;
}

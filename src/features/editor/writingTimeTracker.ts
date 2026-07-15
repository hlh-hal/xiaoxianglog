export const WRITING_IDLE_TIMEOUT_MS = 180_000;
export const WRITING_CHECKPOINT_INTERVAL_MS = 15_000;

const CHECKPOINT_VERSION = 1 as const;
const CHECKPOINT_PREFIX = 'xiang_writing_time_checkpoint:v1:';

export type WritingSegmentEndReason =
  | 'idle_timeout'
  | 'complete'
  | 'exit'
  | 'background'
  | 'page_hidden'
  | 'interruption'
  | 'abandon';

export interface ActiveWritingSegment {
  startedAt: number;
  lastActiveAt: number;
}

export interface ClosedWritingSegment extends ActiveWritingSegment {
  endedAt: number;
  durationMs: number;
  endReason: WritingSegmentEndReason;
}

export interface WritingTimeState {
  elapsedMs: number;
  activeSegment: ActiveWritingSegment | null;
  lastClosedSegment: ClosedWritingSegment | null;
}

export interface WritingTimeCheckpointV1 {
  version: typeof CHECKPOINT_VERSION;
  entryId: string;
  ownerId: string | null;
  totalElapsedMs: number;
  observedAt: number;
  segmentStartedAt: number | null;
  lastActiveAt: number | null;
  endedAt: number | null;
  endReason: WritingSegmentEndReason | null;
}

export interface StoredWritingTimeCheckpoint {
  storageKey: string;
  checkpoint: WritingTimeCheckpointV1;
}

function normalizeTimestamp(value: number, fallback = Date.now()): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeElapsedMs(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function checkpointKey(entryId: string, ownerId: string | null): string {
  const ownerScope = ownerId?.trim() || 'anonymous';
  return `${CHECKPOINT_PREFIX}${encodeURIComponent(ownerScope)}:${encodeURIComponent(entryId)}`;
}

function isWritingSegmentEndReason(value: unknown): value is WritingSegmentEndReason {
  return value === 'idle_timeout'
    || value === 'complete'
    || value === 'exit'
    || value === 'background'
    || value === 'page_hidden'
    || value === 'interruption'
    || value === 'abandon';
}

/** 创建以已持久化累计时长为基线的计时状态。 */
export function createWritingTimeState(elapsedMs = 0): WritingTimeState {
  return {
    elapsedMs: normalizeElapsedMs(elapsedMs),
    activeSegment: null,
    lastClosedSegment: null,
  };
}

/** 记录一次用户发起的编辑活动；超过空闲上限时先关闭旧片段再开始新片段。 */
export function recordActivity(
  state: WritingTimeState,
  timestamp = Date.now(),
  idleTimeoutMs = WRITING_IDLE_TIMEOUT_MS,
): WritingTimeState {
  const now = normalizeTimestamp(timestamp);
  const timeoutMs = normalizeElapsedMs(idleTimeoutMs);
  const segment = state.activeSegment;

  if (!segment) {
    return {
      ...state,
      activeSegment: { startedAt: now, lastActiveAt: now },
    };
  }

  const activityAt = Math.max(segment.lastActiveAt, now);
  if (activityAt - segment.lastActiveAt <= timeoutMs) {
    return {
      ...state,
      activeSegment: {
        ...segment,
        lastActiveAt: activityAt,
      },
    };
  }

  const closed = closeSegment(state, 'idle_timeout', segment.lastActiveAt + timeoutMs, timeoutMs);
  return {
    ...closed,
    activeSegment: { startedAt: activityAt, lastActiveAt: activityAt },
  };
}

/** 读取指定时刻的有效累计时长，不结束当前片段。 */
export function projectTotal(
  state: WritingTimeState,
  timestamp = Date.now(),
  idleTimeoutMs = WRITING_IDLE_TIMEOUT_MS,
): number {
  const segment = state.activeSegment;
  if (!segment) return normalizeElapsedMs(state.elapsedMs);

  const now = Math.max(segment.startedAt, normalizeTimestamp(timestamp));
  const endedAt = Math.min(now, segment.lastActiveAt + normalizeElapsedMs(idleTimeoutMs));
  return normalizeElapsedMs(state.elapsedMs) + Math.max(0, endedAt - segment.startedAt);
}

/** 幂等关闭当前片段；重复生命周期事件不会重复累计。 */
export function closeSegment(
  state: WritingTimeState,
  reason: WritingSegmentEndReason,
  timestamp = Date.now(),
  idleTimeoutMs = WRITING_IDLE_TIMEOUT_MS,
): WritingTimeState {
  const segment = state.activeSegment;
  if (!segment) return state;

  const actualEndAt = Math.max(segment.startedAt, normalizeTimestamp(timestamp));
  const endedAt = Math.min(actualEndAt, segment.lastActiveAt + normalizeElapsedMs(idleTimeoutMs));
  const durationMs = Math.max(0, endedAt - segment.startedAt);

  return {
    elapsedMs: normalizeElapsedMs(state.elapsedMs) + durationMs,
    activeSegment: null,
    lastClosedSegment: {
      ...segment,
      endedAt,
      durationMs,
      endReason: reason,
    },
  };
}

/** 将累计毫秒转换为单调递增的持久化秒数。 */
export function getWritingSeconds(state: WritingTimeState, timestamp = Date.now()): number {
  const totalMs = projectTotal(state, timestamp);
  return totalMs > 0 ? Math.max(1, Math.ceil(totalMs / 1_000)) : 0;
}

/** 完成卡片按四舍五入显示分钟，非零时最少显示一分钟。 */
export function getWritingMinutesFromSeconds(seconds: number): number {
  const normalizedSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (normalizedSeconds <= 0) return 0;
  return Math.max(1, Math.round(normalizedSeconds / 60));
}

/** 构建同步写入 localStorage 的崩溃恢复检查点。 */
export function createWritingTimeCheckpoint(
  entryId: string,
  ownerId: string | null,
  state: WritingTimeState,
  observedAt = Date.now(),
): WritingTimeCheckpointV1 {
  const normalizedObservedAt = normalizeTimestamp(observedAt);
  const segment = state.activeSegment;
  const lastClosed = state.lastClosedSegment;

  return {
    version: CHECKPOINT_VERSION,
    entryId,
    ownerId: ownerId?.trim() || null,
    totalElapsedMs: projectTotal(state, normalizedObservedAt),
    observedAt: normalizedObservedAt,
    segmentStartedAt: segment?.startedAt ?? lastClosed?.startedAt ?? null,
    lastActiveAt: segment?.lastActiveAt ?? lastClosed?.lastActiveAt ?? null,
    endedAt: segment ? null : lastClosed?.endedAt ?? null,
    endReason: segment ? null : lastClosed?.endReason ?? null,
  };
}

/** 崩溃恢复只采用最后观察到的累计值，不外推 App 离开后的时间。 */
export function restoreCheckpoint(
  persistedElapsedMs: number,
  checkpoint: WritingTimeCheckpointV1 | null | undefined,
): WritingTimeState {
  const checkpointElapsedMs = checkpoint ? normalizeElapsedMs(checkpoint.totalElapsedMs) : 0;
  return createWritingTimeState(Math.max(normalizeElapsedMs(persistedElapsedMs), checkpointElapsedMs));
}

export function parseWritingTimeCheckpoint(value: unknown): WritingTimeCheckpointV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const source = value as Partial<WritingTimeCheckpointV1>;
  if (source.version !== CHECKPOINT_VERSION) return null;
  if (typeof source.entryId !== 'string' || !source.entryId.trim()) return null;
  if (source.ownerId !== null && source.ownerId !== undefined && typeof source.ownerId !== 'string') return null;
  if (!Number.isFinite(source.totalElapsedMs) || Number(source.totalElapsedMs) < 0) return null;
  if (!Number.isFinite(source.observedAt) || Number(source.observedAt) <= 0) return null;
  if (source.segmentStartedAt !== null && !Number.isFinite(source.segmentStartedAt)) return null;
  if (source.lastActiveAt !== null && !Number.isFinite(source.lastActiveAt)) return null;
  if (source.endedAt !== null && !Number.isFinite(source.endedAt)) return null;
  if (source.endReason !== null && !isWritingSegmentEndReason(source.endReason)) return null;

  return {
    version: CHECKPOINT_VERSION,
    entryId: source.entryId,
    ownerId: source.ownerId?.trim() || null,
    totalElapsedMs: Number(source.totalElapsedMs),
    observedAt: Number(source.observedAt),
    segmentStartedAt: source.segmentStartedAt === null ? null : Number(source.segmentStartedAt),
    lastActiveAt: source.lastActiveAt === null ? null : Number(source.lastActiveAt),
    endedAt: source.endedAt === null ? null : Number(source.endedAt),
    endReason: source.endReason ?? null,
  };
}

export function readWritingTimeCheckpoint(entryId: string, ownerId: string | null): WritingTimeCheckpointV1 | null {
  if (typeof localStorage === 'undefined') return null;
  const key = checkpointKey(entryId, ownerId);
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const checkpoint = parseWritingTimeCheckpoint(JSON.parse(raw));
    if (checkpoint) return checkpoint;
  } catch {
    // 损坏检查点会在下方清理，避免每次启动重复解析失败。
  }
  localStorage.removeItem(key);
  return null;
}

export function writeWritingTimeCheckpoint(checkpoint: WritingTimeCheckpointV1): void {
  if (typeof localStorage === 'undefined') return;
  const key = checkpointKey(checkpoint.entryId, checkpoint.ownerId);
  const existing = readWritingTimeCheckpoint(checkpoint.entryId, checkpoint.ownerId);
  const next = existing && existing.totalElapsedMs > checkpoint.totalElapsedMs
    ? { ...checkpoint, totalElapsedMs: existing.totalElapsedMs }
    : checkpoint;
  localStorage.setItem(key, JSON.stringify(next));
}

export function removeWritingTimeCheckpoint(entryId: string, ownerId: string | null): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(checkpointKey(entryId, ownerId));
}

export function readAllWritingTimeCheckpoints(): StoredWritingTimeCheckpoint[] {
  if (typeof localStorage === 'undefined') return [];
  const checkpoints: StoredWritingTimeCheckpoint[] = [];

  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const storageKey = localStorage.key(index);
    if (!storageKey?.startsWith(CHECKPOINT_PREFIX)) continue;
    const raw = localStorage.getItem(storageKey);
    try {
      const checkpoint = raw ? parseWritingTimeCheckpoint(JSON.parse(raw)) : null;
      if (checkpoint) {
        checkpoints.push({ storageKey, checkpoint });
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch {
      localStorage.removeItem(storageKey);
    }
  }

  return checkpoints;
}

export function removeStoredWritingTimeCheckpoint(storageKey: string): void {
  if (typeof localStorage === 'undefined' || !storageKey.startsWith(CHECKPOINT_PREFIX)) return;
  localStorage.removeItem(storageKey);
}

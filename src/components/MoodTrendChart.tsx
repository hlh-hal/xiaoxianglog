import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DiaryEntry } from '../services/diaryService';
import {
  buildMoodCurveSegments,
  buildMoodTrendDays,
  type MoodChartPoint,
  type MoodTrendDay,
} from '../utils/moodTrend';

const VIEWBOX_WIDTH = 600;
const VIEWBOX_HEIGHT = 240;
const PLOT_LEFT = 18;
const PLOT_RIGHT = 582;
const PLOT_TOP = 8;
const PLOT_BOTTOM = 232;
export const MOOD_DETAIL_AUTO_HIDE_MS = 8_000;
const AXIS_LEVELS = [
  { score: 2, label: '愉悦' },
  { score: 1, label: '轻松' },
  { score: 0, label: '平静' },
  { score: -1, label: '疲惫' },
  { score: -2, label: '低落' },
] as const;

function scoreToY(score: number): number {
  return PLOT_TOP + ((2 - score) / 4) * (PLOT_BOTTOM - PLOT_TOP);
}

function toPercent(value: number, total: number): number {
  return (value / total) * 100;
}

function getPointX(index: number, count: number): number {
  if (count <= 1) return VIEWBOX_WIDTH / 2;
  return PLOT_LEFT + (index / (count - 1)) * (PLOT_RIGHT - PLOT_LEFT);
}

function latestValidDate(days: MoodTrendDay[]): string {
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].score !== null) return days[index].date;
  }
  return days[days.length - 1]?.date || '';
}

function getExtremaIndexes(days: MoodTrendDay[]): Set<number> {
  const valid = days
    .map((day, index) => ({ index, score: day.score }))
    .filter((item): item is { index: number; score: number } => item.score !== null);
  if (valid.length === 0) return new Set();

  const maxScore = Math.max(...valid.map(({ score }) => score));
  const minScore = Math.min(...valid.map(({ score }) => score));
  const indexes = new Set<number>();
  for (let index = valid.length - 1; index >= 0; index -= 1) {
    if (valid[index].score === maxScore) {
      indexes.add(valid[index].index);
      break;
    }
  }
  if (minScore !== maxScore) {
    for (let index = valid.length - 1; index >= 0; index -= 1) {
      if (valid[index].score === minScore) {
        indexes.add(valid[index].index);
        break;
      }
    }
  }
  return indexes;
}

function getAriaLabel(day: MoodTrendDay): string {
  if (day.score === null) {
    return `${day.weekday}，暂无心情数据`;
  }
  return `${day.weekday}，${day.label}`;
}

function MoodDetail({
  day,
  index,
  align,
  reducedMotion,
  onOpenEntries,
}: {
  day: MoodTrendDay;
  index: number;
  align: 'start' | 'center' | 'end';
  reducedMotion: boolean;
  onOpenEntries?: (day: MoodTrendDay) => void;
}) {
  const alignmentClass = align === 'start'
    ? 'translate-x-0'
    : align === 'end'
      ? '-translate-x-full'
      : '-translate-x-1/2';

  return (
    <motion.div
      key={day.date}
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: reducedMotion ? 0 : 0.45, ease: 'easeOut' }}
      className={`absolute top-0 z-20 w-[min(14rem,calc(100%-0.25rem))] ${alignmentClass} rounded-xl border border-outline-variant/25 bg-surface-container-low/95 px-3 py-2 text-left shadow-[0_8px_24px_-14px_rgba(28,48,22,0.45)] backdrop-blur-sm`}
      style={{ left: `${toPercent(getPointX(index, 7), VIEWBOX_WIDTH)}%` }}
    >
      {day.score === null ? (
        <>
          <p className="text-[13px] font-semibold text-on-surface">{day.weekday} · 暂无心情数据</p>
          <p className="mt-1 text-[11px] leading-relaxed text-on-surface-variant">
            当天没有可展示的心情记录。
          </p>
        </>
      ) : (
        <>
          <p className="text-[13px] font-semibold text-on-surface">{day.weekday} · {day.label}</p>
          {day.summary && (
            <p className="mt-1 line-clamp-2 text-[11px] leading-[1.55] text-on-surface-variant">{day.summary}</p>
          )}
          {day.keywords.length > 0 && (
            <div className="mt-1.5 flex min-w-0 gap-1.5 overflow-hidden" aria-label={`主题：${day.keywords.join('、')}`}>
              {day.keywords.slice(0, 3).map((keyword) => (
                <span
                  key={keyword}
                  className="min-w-0 max-w-[4.75rem] truncate rounded-full bg-primary/8 px-2 py-0.5 text-[10px] leading-4 text-on-surface-variant"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}
          {day.entryIds.length > 0 && onOpenEntries && (
            <button
              type="button"
              onClick={() => onOpenEntries(day)}
              aria-label={`查看${day.weekday}的日志`}
              className="mt-1 flex min-h-9 w-full items-center justify-between rounded-lg text-[11px] font-medium text-primary outline-none transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <span>查看当天日志</span>
              <span className="text-sm" aria-hidden="true">&gt;</span>
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}

export function MoodTrendChart({
  entries,
  detailAutoHideMs = MOOD_DETAIL_AUTO_HIDE_MS,
  initialSelectedDate,
  onOpenEntries,
}: {
  entries: DiaryEntry[];
  detailAutoHideMs?: number;
  initialSelectedDate?: string;
  onOpenEntries?: (day: MoodTrendDay) => void;
}) {
  const days = useMemo(() => buildMoodTrendDays(entries), [entries]);
  const [selectedDate, setSelectedDate] = useState(() => (
    days.some((day) => day.date === initialSelectedDate && day.score !== null)
      ? initialSelectedDate as string
      : latestValidDate(days)
  ));
  const [isDetailVisible, setIsDetailVisible] = useState(true);
  const activePointerId = useRef<number | null>(null);
  const detailTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const hasMoodData = days.some(({ score }) => score !== null);

  const showDetailTemporarily = useCallback(() => {
    if (detailTimer.current) clearTimeout(detailTimer.current);
    setIsDetailVisible(true);
    detailTimer.current = setTimeout(() => {
      setIsDetailVisible(false);
      detailTimer.current = null;
    }, detailAutoHideMs);
  }, [detailAutoHideMs]);

  const selectDay = useCallback((date: string) => {
    setSelectedDate(date);
    showDetailTemporarily();
  }, [showDetailTemporarily]);

  useEffect(() => {
    if (hasMoodData) showDetailTemporarily();
    return () => {
      if (detailTimer.current) clearTimeout(detailTimer.current);
    };
  }, [days, hasMoodData, showDetailTemporarily]);

  useEffect(() => {
    setSelectedDate((currentDate) => {
      const currentDay = days.find(({ date }) => date === currentDate);
      return currentDay?.score !== null && currentDay?.score !== undefined
        ? currentDate
        : latestValidDate(days);
    });
  }, [days]);

  const points = useMemo<MoodChartPoint[]>(() => days.map((day, index) => ({
    index,
    x: getPointX(index, days.length),
    y: day.score === null ? null : scoreToY(day.score),
  })), [days]);
  const segments = useMemo(() => buildMoodCurveSegments(points, PLOT_BOTTOM), [points]);
  const extremaIndexes = useMemo(() => getExtremaIndexes(days), [days]);
  const selectedIndex = Math.max(0, days.findIndex(({ date }) => date === selectedDate));
  const selectedDay = days[selectedIndex] || days[days.length - 1];
  const selectedPoint = points[selectedIndex];
  const detailAlign = selectedIndex <= 1 ? 'start' : selectedIndex >= days.length - 2 ? 'end' : 'center';
  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: 0.6, ease: 'easeInOut' as const };

  const selectNearestDay = (clientX: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const index = Math.round(ratio * (days.length - 1));
    if (days[index]) selectDay(days[index].date);
  };

  if (!hasMoodData) {
    return (
      <div className="flex min-h-[250px] items-center justify-center rounded-2xl bg-surface-container-lowest px-7 text-center shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)]">
        <div>
          <p className="text-[15px] font-semibold text-on-surface">最近还没有足够的心情记录</p>
          <p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">记录几篇日志后，这里会展示你的情绪变化。</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl bg-surface-container-lowest px-4 pb-4 pt-3 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.04)] sm:px-5"
      aria-label="最近七天心情趋势图"
    >
      <div className="relative h-[148px]">
        <AnimatePresence mode="wait">
          {isDetailVisible && selectedDay && (
            <MoodDetail
              day={selectedDay}
              index={selectedIndex}
              align={detailAlign}
              reducedMotion={Boolean(prefersReducedMotion)}
              onOpenEntries={onOpenEntries}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-1.5">
        <div className="relative h-[clamp(220px,58vw,270px)]" aria-hidden="true">
          {AXIS_LEVELS.map(({ label, score }) => (
            <span
              key={label}
              className="absolute right-1 -translate-y-1/2 whitespace-nowrap text-[9px] font-medium text-outline/55 dark:text-on-surface-variant/80"
              style={{ top: `${toPercent(scoreToY(score), VIEWBOX_HEIGHT)}%` }}
            >
              {label}
            </span>
          ))}
        </div>

        <div
          data-testid="mood-trend-plot"
          className="relative h-[clamp(220px,58vw,270px)] select-none touch-pan-y"
          onPointerDown={(event) => {
            activePointerId.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            selectNearestDay(event.clientX, event.currentTarget);
          }}
          onPointerMove={(event) => {
            if (activePointerId.current === event.pointerId) {
              selectNearestDay(event.clientX, event.currentTarget);
            }
          }}
          onPointerUp={(event) => {
            if (activePointerId.current === event.pointerId) {
              activePointerId.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
          onPointerCancel={() => {
            activePointerId.current = null;
          }}
        >
          {AXIS_LEVELS.map(({ score }) => (
            <div
              key={score}
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-outline-variant/25 dark:border-outline-variant/30"
              style={{ top: `${toPercent(scoreToY(score), VIEWBOX_HEIGHT)}%` }}
            />
          ))}

          {selectedPoint && (
            <motion.div
              className="pointer-events-none absolute bottom-[3.33%] top-[3.33%] z-10 w-px bg-primary/20"
              animate={{ left: `${toPercent(selectedPoint.x, VIEWBOX_WIDTH)}%` }}
              transition={transition}
            />
          )}

          <svg
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-primary"
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="mood-trend-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.1" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
            </defs>
            <AnimatePresence initial={false}>
              {segments.map((segment) => segment.areaPath && (
                <motion.path
                  key={`area-${segment.key}`}
                  initial={{ d: segment.areaPath, opacity: 0 }}
                  animate={{ d: segment.areaPath, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  fill="url(#mood-trend-area)"
                />
              ))}
            </AnimatePresence>
            <AnimatePresence initial={false}>
              {segments.map((segment) => (
                <motion.path
                  key={`line-${segment.key}`}
                  initial={{ d: segment.path, opacity: 0 }}
                  animate={{ d: segment.path, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={transition}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </AnimatePresence>
          </svg>

          {points.map((point, index) => {
            if (point.y === null || index === selectedIndex) return null;
            const isExtrema = extremaIndexes.has(index);
            return (
              <span
                key={`point-${days[index].date}`}
                aria-hidden="true"
                data-mood-marker={days[index].date}
                data-extrema={isExtrema ? 'true' : undefined}
                className="pointer-events-none absolute z-20 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-surface-container-lowest"
                style={{
                  left: `${toPercent(point.x, VIEWBOX_WIDTH)}%`,
                  top: `${toPercent(point.y, VIEWBOX_HEIGHT)}%`,
                }}
              />
            );
          })}

          {selectedPoint?.y !== null && selectedPoint?.y !== undefined && (
            <motion.span
              aria-hidden="true"
              data-mood-marker={selectedDay.date}
              data-selected="true"
              className="pointer-events-none absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_5px_rgba(68,103,51,0.16)] ring-2 ring-surface-container-lowest dark:shadow-[0_0_0_5px_rgba(90,138,66,0.2)]"
              animate={{
                left: `${toPercent(selectedPoint.x, VIEWBOX_WIDTH)}%`,
                top: `${toPercent(selectedPoint.y, VIEWBOX_HEIGHT)}%`,
              }}
              transition={transition}
            />
          )}

          {days.map((day, index) => {
            const point = points[index];
            const top = point.y === null ? VIEWBOX_HEIGHT / 2 : point.y;
            return (
              <button
                key={day.date}
                type="button"
                aria-label={getAriaLabel(day)}
                aria-pressed={selectedDate === day.date}
                data-mood-date={day.date}
                onClick={() => selectDay(day.date)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectDay(day.date);
                  }
                }}
                className="absolute z-40 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest"
                style={{
                  left: `${toPercent(point.x, VIEWBOX_WIDTH)}%`,
                  top: `${toPercent(top, VIEWBOX_HEIGHT)}%`,
                }}
              />
            );
          })}
        </div>

        <div aria-hidden="true" />
        <div className="relative mt-2 h-5 text-[10px] font-medium text-outline dark:text-on-surface-variant/85">
          {days.map((day, index) => (
            <span
              key={day.date}
              className={`absolute -translate-x-1/2 whitespace-nowrap transition-colors duration-200 ${selectedDate === day.date ? 'text-primary' : ''}`}
              style={{ left: `${toPercent(points[index].x, VIEWBOX_WIDTH)}%` }}
            >
              {day.weekday}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

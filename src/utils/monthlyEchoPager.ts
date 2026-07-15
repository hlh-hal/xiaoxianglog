export type MonthlyEchoSwipeDecision = {
  targetIndex: number;
  shouldAdvance: boolean;
};

type ResolveMonthlyEchoSwipeParams = {
  currentIndex: number;
  pageCount: number;
  deltaY: number;
  velocityY: number;
  viewportHeight: number;
};

export function clampMonthlyEchoPage(index: number, pageCount: number): number {
  return Math.min(Math.max(0, pageCount - 1), Math.max(0, index));
}

export function applyMonthlyEchoEdgeResistance(
  deltaY: number,
  currentIndex: number,
  pageCount: number,
): number {
  const pullingPastStart = currentIndex === 0 && deltaY > 0;
  const pullingPastEnd = currentIndex === pageCount - 1 && deltaY < 0;
  if (!pullingPastStart && !pullingPastEnd) return deltaY;

  // A diminishing curve keeps the first and last pages tactile without exposing empty space.
  return Math.sign(deltaY) * Math.pow(Math.abs(deltaY), 0.78) * 0.42;
}

export function resolveMonthlyEchoSwipe({
  currentIndex,
  pageCount,
  deltaY,
  velocityY,
  viewportHeight,
}: ResolveMonthlyEchoSwipeParams): MonthlyEchoSwipeDecision {
  const distanceThreshold = Math.max(52, viewportHeight * 0.1);
  const crossedDistance = Math.abs(deltaY) >= distanceThreshold;
  const flicked = Math.abs(deltaY) >= 12 && Math.abs(velocityY) >= 0.42;

  if (!crossedDistance && !flicked) {
    return { targetIndex: currentIndex, shouldAdvance: false };
  }

  const direction = deltaY < 0 ? 1 : -1;
  const targetIndex = clampMonthlyEchoPage(currentIndex + direction, pageCount);
  return {
    targetIndex,
    shouldAdvance: targetIndex !== currentIndex,
  };
}

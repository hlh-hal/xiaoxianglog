import prisma from './prisma.js';
import { stringArray } from '../utils/request.js';

export function parseStoredStringArray(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string' && item.trim() !== '') : [];
  } catch {
    return [];
  }
}

export function areStringArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

export async function saveEditHistorySnapshot(params: {
  entryId: string;
  userId: string;
  content?: string | null;
  images?: string[] | null;
}) {
  const safeContent = String(params.content ?? '').slice(0, 200000);
  const safeImages = stringArray(params.images || [], 20, 2000);
  if (!safeContent && safeImages.length === 0) return null;

  const lastHistory = await prisma.editHistory.findFirst({
    where: { entryId: params.entryId, userId: params.userId },
    orderBy: { savedAt: 'desc' },
    select: { id: true, content: true, images: true },
  });

  if (
    lastHistory
    && lastHistory.content === safeContent
    && areStringArraysEqual(parseStoredStringArray(lastHistory.images), safeImages)
  ) {
    return null;
  }

  const summary = safeContent.substring(0, 50) + (safeContent.length > 50 ? '...' : '');
  return prisma.editHistory.create({
    data: {
      entryId: params.entryId,
      userId: params.userId,
      content: safeContent,
      images: safeImages.length > 0 ? JSON.stringify(safeImages) : null,
      summary,
    },
  });
}

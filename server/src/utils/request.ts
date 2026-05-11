import type { Request } from 'express';

export function paramString(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export function queryString(req: Request, name: string): string {
  const value = req.query[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

export function positiveInt(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function stringArray(value: unknown, maxItems = 20, maxItemLength = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.slice(0, maxItemLength))
    .slice(0, maxItems);
}

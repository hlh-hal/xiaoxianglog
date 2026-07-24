import { diaryService } from '../services/diaryService';
import { format } from 'date-fns';
import { htmlToMarkdown } from './htmlToMarkdown';
import { downloadTextFile } from './exportFile';
import { inferDateWithAI, parseWholeMarkdownWithAI } from './inferDateWithAI';
import { localVaultService } from '../services/localVaultService';
import { compareDiaryDateDesc, parseDiaryDateKey, toDiaryDateKey } from './diaryDate';
import { filterDiariesByDateRange } from './exportDateRange';
import type { DiaryExportDateRange } from './exportDateRange';

export interface ParsedEntry {
  title: string;
  date: string;
  content: string;
  dateUncertain?: boolean;
  dateSource?: 'parsed' | 'ai' | 'fallback' | 'manual';
  rawDateHint?: string;
  skip?: boolean;
}

export const exportDiariesToMarkdown = async (
  range: DiaryExportDateRange = { type: 'all' },
): Promise<number> => {
  const allEntries = await diaryService.getActiveEntries();
  const entries = filterDiariesByDateRange(allEntries, range);
  if (entries.length === 0) {
    return 0;
  }

  const sortedEntries = [...entries].sort(
    (a, b) => compareDiaryDateDesc(a.diaryDate, b.diaryDate),
  );

  const today = format(new Date(), 'yyyy-MM-dd');
  let mdContent = '';

  sortedEntries.forEach((entry) => {
    const dateStr = format(parseDiaryDateKey(entry.diaryDate), 'yyyy-MM-dd');
    mdContent += `**${dateStr}**\n\n`;

    if (entry.blocks && entry.blocks.length > 0) {
      mdContent += entry.blocks
        .map((block) => `${block.title ? `- **${block.title}**：` : ''}${htmlToMarkdown(block.content)}`)
        .join('\n');
    } else {
      mdContent += htmlToMarkdown(entry.content || '');
    }

    mdContent += '\n\n\n';
  });

  const filename = `小象日志备份-${today}.md`;
  const savedToVault = await localVaultService.exportBackup(filename, mdContent.trim()).catch(() => false);
  if (!savedToVault) {
    downloadTextFile(filename, mdContent.trim(), 'text/markdown;charset=utf-8');
  }
  return entries.length;
};

function formatDate(year: string, month: string, day: string): string | null {
  const y = Number.parseInt(year, 10);
  const m = Number.parseInt(month, 10);
  const d = Number.parseInt(day, 10);

  if (y < 1900 || y > 2100) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    return null;
  }

  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseFlexibleDate(input: string): string | null {
  if (!input) return null;

  const cleaned = input
    .replace(/^\uFEFF/, '')
    .replace(/^[>\-*\s#]+/, '')
    .replace(/[*_`~]/g, '')
    .trim();

  const standard = cleaned.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (standard) {
    return formatDate(standard[1], standard[2], standard[3]);
  }

  const compact = cleaned.match(/(?:^|[^\d])(\d{4})(\d{2})(\d{2})(?:[^\d]|$)/);
  if (compact) {
    return formatDate(compact[1], compact[2], compact[3]);
  }

  const shortCompact = cleaned.match(/^\s*(\d{2})(\d{2})(\d{2})\s*$/);
  if (shortCompact) {
    return formatDate(`20${shortCompact[1]}`, shortCompact[2], shortCompact[3]);
  }

  const yearAndMd = cleaned.match(/(\d{4})[-/.年](\d{3,4})(?:[^\d]|$)/);
  if (yearAndMd) {
    const md = yearAndMd[2];
    const month = md.length === 4 ? md.slice(0, 2) : md.slice(0, 1);
    const day = md.length === 4 ? md.slice(2) : md.slice(1);
    return formatDate(yearAndMd[1], month, day);
  }

  return null;
}

export const parseMarkdownFile = (text: string, filename?: string): ParsedEntry[] => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const entriesMap = new Map<string, string[]>();
  let currentDate: string | null = null;
  let pendingYear: string | null = null;

  let filenameDate: string | null = null;
  if (filename) {
    filenameDate = parseFlexibleDate(filename.replace(/\.[^.]+$/, ''));
  }

  for (const line of lines) {
    const cleanedLine = line.replace(/[*#]/g, '').trim();
    const extractedDate = parseFlexibleDate(line);

    const yearMatch = cleanedLine.match(/^(\d{4})$/);
    if (!extractedDate && yearMatch) {
      pendingYear = yearMatch[1];
      continue;
    }

    const mdMatch = cleanedLine.match(/^(\d{1,2})[-/.](\d{1,2})$/);
    const combinedDate = !extractedDate && mdMatch && pendingYear
      ? formatDate(pendingYear, mdMatch[1], mdMatch[2])
      : null;

    const actualDate = extractedDate || combinedDate;

    if (actualDate) {
      currentDate = actualDate;
      if (extractedDate) {
        const match = extractedDate.match(/^(\d{4})/);
        if (match) pendingYear = match[1];
      }

      if (!entriesMap.has(currentDate)) {
        entriesMap.set(currentDate, []);
      } else {
        const existing = entriesMap.get(currentDate)!;
        if (existing.length > 0 && existing[existing.length - 1].trim() !== '') {
          existing.push('');
        }
      }
    } else if (currentDate !== null) {
      entriesMap.get(currentDate)!.push(line);
    } else {
      if (line.trim() === '') continue;

      const fallback = filenameDate || '';
      currentDate = fallback;
      if (!entriesMap.has(currentDate)) {
        entriesMap.set(currentDate, [line]);
      } else {
        entriesMap.get(currentDate)!.push(line);
      }
    }
  }

  const entries: ParsedEntry[] = [];
  for (const [date, entryLines] of entriesMap.entries()) {
    entries.push(finalizeEntry({ date, lines: entryLines, isFallback: date === '' }));
  }

  return entries;
};

const getTodayStr = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

function cleanText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*{1,2}([^*\n]+)\*{1,2}/g, '$1')
    .replace(/^[\s]*[-*]\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

const finalizeEntry = (raw: { date: string; lines: string[]; isFallback?: boolean }): ParsedEntry => {
  const content = raw.lines.join('\n').trim();
  const firstNonEmptyLine = raw.lines.find((line) => line.trim() !== '');
  const cleanedTitle = firstNonEmptyLine ? cleanText(firstNonEmptyLine).slice(0, 30) : '';
  const title = cleanedTitle || raw.date || getTodayStr();

  if (raw.isFallback) {
    return {
      title,
      date: '',
      content,
      dateUncertain: true,
      dateSource: 'fallback',
      rawDateHint: raw.lines.slice(0, 3).join('\n'),
    };
  }

  return {
    title,
    date: raw.date,
    content,
    dateSource: 'parsed',
  };
};

export const importBackup = async (file: File, useAI?: boolean): Promise<ParsedEntry[]> => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'md') {
    throw new Error('请选择 .md 格式的备份文件');
  }

  const text = await file.text();

  if (useAI) {
    const aiResult = await parseWholeMarkdownWithAI(text);
    if (aiResult && aiResult.length > 0) {
      return aiResult as ParsedEntry[];
    }

    console.warn('AI parsing failed or returned empty, falling back to regex based parse.');
  }

  return parseMarkdownFile(text, file.name);
};

export const resolveUncertainDates = async (
  entries: ParsedEntry[],
  onProgress?: (current: number, total: number) => void,
): Promise<ParsedEntry[]> => {
  const uncertainEntries = entries.filter((entry) => entry.dateUncertain === true);
  if (uncertainEntries.length === 0) return entries;

  let completed = 0;
  onProgress?.(0, uncertainEntries.length);

  const chunks: ParsedEntry[][] = [];
  for (let i = 0; i < uncertainEntries.length; i += 3) {
    chunks.push(uncertainEntries.slice(i, i + 3));
  }

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (entry) => {
        const newDate = await inferDateWithAI(entry.rawDateHint || '', entry.content);
        if (newDate) {
          entry.date = newDate;
          entry.dateSource = 'ai';
        } else {
          entry.date = getTodayStr();
          entry.dateSource = 'fallback';
        }
        completed++;
        onProgress?.(completed, uncertainEntries.length);
      }),
    );
  }

  return entries;
};

export const saveParsedEntries = async (
  entries: ParsedEntry[],
): Promise<{ successCount: number; failCount: number }> => {
  let successCount = 0;
  let failCount = 0;

  for (const entry of entries) {
    if (entry.dateSource === 'fallback') {
      failCount++;
    } else {
      successCount++;
    }

    const diaryDate = parseDiaryDateKey(entry.date);

    await diaryService.createEntry({
      title: entry.title,
      content: entry.content,
      images: [],
      diaryDate: toDiaryDateKey(diaryDate),
    });
  }

  return { successCount, failCount };
};

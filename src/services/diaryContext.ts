import { diaryService } from './diaryService';

const MAX_CONTEXT_CHARS = 40000; // 约4万字

function stripMarkdown(md: string) {
  return md.replace(/[#*`>]/g, '').trim();
}

let cachedContext: string | null = null;

export async function buildDiaryContext(forceRefresh = false): Promise<string> {
  if (cachedContext !== null && !forceRefresh) {
    return cachedContext;
  }

  const entries = await diaryService.getActiveEntries();
  if (entries.length === 0) {
    cachedContext = '';
    return '';
  }

  // 按日期排序 (getActiveEntries already sorts, but let's ensure it's by date)
  const sorted = entries.sort((a, b) =>
    new Date(b.diaryDate).getTime() - new Date(a.diaryDate).getTime()
  );

  // 提取关键信息
  const summary = {
    totalCount: entries.length,
    dateRange: `${sorted[sorted.length-1].diaryDate.split('T')[0]} 至 ${sorted[0].diaryDate.split('T')[0]}`,
    recentEntries: sorted.slice(0, 30),  // 最近30篇完整内容
    olderEntries: sorted.slice(30),       // 更早的只提取摘要
  };

  let context = `
=== 用户日记数据库 ===
总日记数：${summary.totalCount} 篇
记录时间范围：${summary.dateRange}

=== 最近 30 篇日记（完整内容）===
`;

  let charCount = context.length;

  for (const entry of summary.recentEntries) {
    const text = `【${entry.diaryDate.split('T')[0]}】\n${stripMarkdown(entry.content).slice(0, 500)}\n---\n`;
    if (charCount + text.length > MAX_CONTEXT_CHARS) break;
    context += text;
    charCount += text.length;
  }

  // 如果有更早的日记，提取摘要
  if (summary.olderEntries.length > 0 && charCount < MAX_CONTEXT_CHARS) {
    context += `\n=== 更早的日记（摘要）===\n`;
    for (const entry of summary.olderEntries) {
      const text = `【${entry.diaryDate.split('T')[0]}】${stripMarkdown(entry.content).slice(0, 100)}\n`;
      if (charCount + text.length > MAX_CONTEXT_CHARS) break;
      context += text;
      charCount += text.length;
    }
  }

  cachedContext = context;
  return context;
}

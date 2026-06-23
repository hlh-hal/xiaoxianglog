import { api, isAuthenticated } from './apiClient';
import { diaryService, type DiaryEntry } from './diaryService';
import {
  type AnnualEchoAiPayload,
  type AnnualEchoDigest,
  type AnnualEchoStats,
  type AnnualEchoQuoteCandidate,
  buildAnnualEchoFallbackDigest,
  buildAnnualEchoStats,
  extractAnnualQuoteCandidates,
  getAnnualEchoEntries,
  validateAnnualEchoAiPayload,
} from '../utils/annualEcho';
import { getKeywordSourceText, stripMarkdown } from '../utils/textUtils';
import { getDiaryDateKey } from '../utils/diaryDate';

type AnnualEchoCompletionResult = {
  content?: string;
  finishReason?: string | null;
};

type LoadAnnualEchoOptions = {
  forceRefresh?: boolean;
  now?: Date;
};

function safeJsonParse(value: string): AnnualEchoAiPayload | null {
  const raw = value.trim();
  if (!raw) return null;
  const withoutFence = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return null;
  }
}

function formatCandidate(candidate: AnnualEchoQuoteCandidate, index: number): string {
  return `${index + 1}. [${candidate.date} | ${candidate.entryId}] ${candidate.text}`;
}

function buildAnnualEchoContext(entries: DiaryEntry[]): string {
  return entries
    .slice(0, 90)
    .map((entry) => {
      const text = stripMarkdown(getKeywordSourceText(entry), true)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
      return `- ${getDiaryDateKey(entry.diaryDate)} | ${entry.id}: ${text}`;
    })
    .join('\n');
}

function buildAnnualEchoPrompt(entries: DiaryEntry[], candidates: AnnualEchoQuoteCandidate[], stats: AnnualEchoStats): string {
  return `你是小象日志的「年度回声」模块。请基于用户这一年的日记，生成克制、温和、可被用户验证的年度回顾素材。

只输出 JSON，不要 Markdown，不要解释。

JSON 形状：
{
  "quotes": [
    { "text": "必须完全复制候选金句之一", "entryId": "候选里的 entryId", "date": "YYYY-MM-DD" }
  ],
  "annualReply": "一句关于这一年的总回应，40字以内，不评判、不贴人格标签",
  "manualItems": [
    { "text": "只要……我就……", "evidenceEntryIds": ["entry id"], "evidenceDates": ["YYYY-MM-DD"] }
  ]
}

规则：
1. quotes 返回 3-5 条；每条 text 必须一字不改地来自候选金句，不能改写。
2. manualItems 不限制数量，但必须正确、有证据；证据不足就少写或不写。
3. manualItems 每条必须是「只要……我就……」句式。
4. 不要输出人格诊断、心理标签、情绪评分、夸张成就感。
5. 不要暴露隐私或涉及第三方隐私的原文。

年度统计：
- 年份：${stats.year}
- 日志数：${stats.totalEntries}
- 记录天数：${stats.writingDays}
- 总字数：${stats.totalWords}
- 全勤周数：${stats.perfectWeeks}
- 最多月份：${stats.busiestMonth.month}月，${stats.busiestMonth.entryCount}篇

候选金句：
${candidates.map(formatCandidate).join('\n') || '无'}

年度日记摘要：
${buildAnnualEchoContext(entries) || '无'}
`;
}

async function generateAnnualEchoWithAi(entries: DiaryEntry[], candidates: AnnualEchoQuoteCandidate[], stats: AnnualEchoStats): Promise<AnnualEchoAiPayload | null> {
  if (!isAuthenticated() || entries.length === 0) return null;
  try {
    const result = await api.post<AnnualEchoCompletionResult>('/chat/complete', {
      modelId: import.meta.env?.VITE_AI_MODEL || 'xiaomi-mimo',
      temperature: 0.36,
      maxTokens: 1800,
      messages: [
        {
          role: 'system',
          content: '你是小象日志的年度回声生成器。你只输出严格 JSON，所有判断都必须能被用户日记证据支持。',
        },
        {
          role: 'user',
          content: buildAnnualEchoPrompt(entries, candidates, stats),
        },
      ],
    });
    return safeJsonParse(result.content || '');
  } catch (error) {
    console.warn('Annual echo AI generation failed, using local fallback:', error);
    return null;
  }
}

export const annualEchoService = {
  async loadAnnualEcho(year: number, options: LoadAnnualEchoOptions = {}): Promise<AnnualEchoDigest> {
    const now = options.now || new Date();
    const allEntries = await diaryService.getActiveEntries();
    const annualEntries = getAnnualEchoEntries(allEntries, year, now);
    const stats = buildAnnualEchoStats(allEntries, year, now);
    const cached = options.forceRefresh ? null : await diaryService.getAnnualEchoDigest(year);

    if (cached && cached.sourceHash === stats.sourceHash && Array.isArray(cached.quotes)) {
      return cached;
    }

    const candidates = extractAnnualQuoteCandidates(annualEntries);
    const aiPayload = await generateAnnualEchoWithAi(annualEntries, candidates, stats);
    const digest = aiPayload
      ? validateAnnualEchoAiPayload(aiPayload, stats, candidates, annualEntries, now)
      : buildAnnualEchoFallbackDigest(stats, candidates, now);

    await diaryService.saveAnnualEchoDigest(digest);
    return digest;
  },
};

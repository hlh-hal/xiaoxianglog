import { api } from '../services/apiClient';

export interface ParsedResult {
  title: string;
  date: string;
  content: string;
  dateUncertain?: boolean;
  dateSource?: string;
  rawDateHint?: string;
}

async function completeWithBackend(prompt: string, options?: { maxTokens?: number; responseFormat?: unknown }) {
  const data = await api.post<{ content: string }>('/chat/complete', {
    modelId: import.meta.env.VITE_AI_MODEL || 'xiaomi-mimo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    maxTokens: options?.maxTokens,
    responseFormat: options?.responseFormat,
  });

  return (data.content || '').trim();
}

export async function parseWholeMarkdownWithAI(text: string): Promise<ParsedResult[] | null> {
  try {
    const prompt = `你是专业的日记文档解析助手。请把下面整段 Markdown 日记文本拆分成独立日记条目，并尽量识别每篇日记的日期。

要求：
1. 返回严格 JSON，不要 Markdown 代码块，不要解释。
2. JSON 顶层可以是数组，也可以是包含数组字段的对象。
3. 每个条目包含 title、date、content、dateSource、dateUncertain、rawDateHint。
4. date 必须是 YYYY-MM-DD；无法判断就用空字符串。
5. content 必须保留对应日记的完整原文。

日记全文：
------
${text}
------`;

    let reply = await completeWithBackend(prompt, {
      responseFormat: { type: 'json_object' },
    });

    if (reply.startsWith('```json')) {
      reply = reply.replace(/^```json\n?/, '').replace(/```$/, '').trim();
    } else if (reply.startsWith('```')) {
      reply = reply.replace(/^```\n?/, '').replace(/```$/, '').trim();
    }

    let parsed: any = JSON.parse(reply);
    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object') {
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) {
          parsed = parsed[key];
          break;
        }
      }
    }

    if (!Array.isArray(parsed)) return null;

    return parsed.map((item) => ({
      title: item?.title || '',
      date: item?.date && item.date !== 'null' ? item.date : '',
      content: item?.content || '',
      dateSource: item?.dateSource || 'ai',
      dateUncertain: typeof item?.dateUncertain === 'boolean' ? item.dateUncertain : !item?.date,
      rawDateHint: item?.rawDateHint || '',
    }));
  } catch (error) {
    console.error('parseWholeMarkdownWithAI error:', error);
    return null;
  }
}

export async function inferDateWithAI(hint: string, content: string): Promise<string | null> {
  try {
    const prompt = `你是日记日期识别助手。根据下面信息判断这篇日记最可能写于哪一天。

开头/日期线索：
---
${hint}
---

正文前 200 字：
---
${content.slice(0, 200)}
---

只输出 YYYY-MM-DD；如果无法判断，只输出 null。`;

    const reply = await completeWithBackend(prompt, { maxTokens: 100 });
    const match = reply.match(/\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : null;
  } catch (error) {
    console.error('inferDateWithAI error:', error);
    return null;
  }
}

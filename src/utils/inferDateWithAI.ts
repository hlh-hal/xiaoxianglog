export interface ParsedResult {
  title: string;
  date: string;
  content: string;
  dateUncertain?: boolean;
  dateSource?: string;
  rawDateHint?: string;
}

export async function parseWholeMarkdownWithAI(
  text: string
): Promise<ParsedResult[] | null> {
  try {
    let API_KEY = import.meta.env.VITE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
    let BASE_URL = import.meta.env.VITE_AI_BASE_URL || '';
    let MODEL = import.meta.env.VITE_AI_MODEL || 'xiaomi-mimo';
    if (MODEL.includes(',')) {
      MODEL = 'xiaomi-mimo';
    }

    if (MODEL === 'xiaomi-mimo') {
      BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1';
      API_KEY = 'tp-c9v2y0ra8n4swaaqsuvmigzr5dau0vhg2c2y32jmj0cmjc6o';
      MODEL = 'mimo-v2.5';
    }

    if (!BASE_URL || !API_KEY) {
      console.warn('AI settings not configured for parseWholeMarkdownWithAI');
      return null;
    }

    const cleanBaseUrl = BASE_URL.replace(/\/$/, '');
    const url = `${cleanBaseUrl}/chat/completions`;

    const prompt = `你是专业的日记文档解析助手。我有一段完整的 Markdown 格式日记文本，其中可能包含多篇日记。
由于用户的连笔、格式不规范或使用模糊日期（如“昨天这是第六篇”、“这篇写于二零二六年”、“星期三这是第七篇”等），多篇日记可能会粘连在一个文本块中。

你的任务是：
1. 仔细阅读下面提供给你的全部日记全文，将其拆分成独立的日记条目。
2. 识别每一篇日记的对应日期（即使没有明显的日期，你也尽力根据上下文推断）。如果有模糊日期词（比如“昨天”、“周三”），你可以基于它去推断，如果实在无法确定具体的年月日，保留原文本或者空字符串皆可。如果不确定，你可以标记出来。
3. 保证每篇日记的正文完整保留，绝不丢失任何原始文本。即使同一段文字既包含日期信息也包含日记内容，整个文本也要保留到正文里。

请返回严格的 JSON 数组格式，不要包含 Markdown 格式块（如 \`\`\`json ），必须直接返回可解析的 JSON 字符串。
数组每个对象必须包含以下字段：
- "title": 字符串，可提取前一句或前20个字符。
- "date": 字符串，格式必须为 "YYYY-MM-DD"（例如 2026-04-10）。如果在文中完全没提日期或者你推断不出，则设为 ""。
- "content": 字符串，这篇日记的完整原始内容。
- "dateSource": 字符串，如果成功推断为确切日期请设为 "ai"，如果你只能给出空串则设为 "fallback"。
- "dateUncertain": 布尔值，如果你设了 fallback 或不确定是不是这个日期，请设为 true，否则为 false。
- "rawDateHint": 字符串，原文本中你认为是提示日期的那一行或那几个词，如果找不到就填空。

以下是日记全文：
------
${text}
------

请只输出纯 JSON 数组，严禁其他多余废话。`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    if (!res.ok) {
      console.error('parseWholeMarkdownWithAI API error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    let reply = data.choices?.[0]?.message?.content?.trim() || '';
    
    // some models ignore response_format or wrap in markdown
    if (reply.startsWith('```json')) {
      reply = reply.replace(/^```json\n?/, '').replace(/```$/, '').trim();
    } else if (reply.startsWith('```')) {
      reply = reply.replace(/^```\n?/, '').replace(/```$/, '').trim();
    }

    // Attempt to parse json. Some models might return an object like {entries: [...]} instead of an array.
    let parsed: any = JSON.parse(reply);
    
    if (!Array.isArray(parsed)) {
      // Find the first array property
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) {
          parsed = parsed[key];
          break;
        }
      }
    }
    
    if (Array.isArray(parsed)) {
      // normalize
      const finalArray = parsed.map(p => ({
        title: p.title || '',
        date: p.date && p.date !== 'null' ? p.date : '',
        content: p.content || '',
        dateSource: p.dateSource || 'ai',
        dateUncertain: typeof p.dateUncertain === 'boolean' ? p.dateUncertain : (!p.date),
        rawDateHint: p.rawDateHint || ''
      }));
      return finalArray;
    }

    return null;
  } catch (error) {
    console.error('parseWholeMarkdownWithAI error:', error);
    return null;
  }
}

export async function inferDateWithAI(
  hint: string,
  content: string
): Promise<string | null> {
  try {
    let API_KEY = import.meta.env.VITE_AI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '';
    let BASE_URL = import.meta.env.VITE_AI_BASE_URL || '';
    let MODEL = import.meta.env.VITE_AI_MODEL || 'xiaomi-mimo';
    if (MODEL.includes(',')) {
      MODEL = 'xiaomi-mimo';
    }

    if (MODEL === 'xiaomi-mimo') {
      BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1';
      API_KEY = 'tp-c9v2y0ra8n4swaaqsuvmigzr5dau0vhg2c2y32jmj0cmjc6o';
      MODEL = 'mimo-v2.5';
    }

    if (!BASE_URL || !API_KEY) {
      console.warn('AI settings not configured for inferDateWithAI');
      return null;
    }

    const cleanBaseUrl = BASE_URL.replace(/\/$/, '');
    const url = `${cleanBaseUrl}/chat/completions`;

    const prompt = `你是日记日期识别助手。我有一段从 Markdown 文件导入的日记片段，
但无法自动识别它的日期。

以下是该日记的开头内容：
---
${hint}
---

正文前200字：
${content.slice(0, 200)}
---

请判断这篇日记最可能写于哪一天。
- 如果能确定，只返回格式为 YYYY-MM-DD 的日期，不要其他文字。
- 如果完全无法判断，只返回 null。

不要解释，不要废话，只输出日期或 null。`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.1
      })
    });

    if (!res.ok) {
      console.error('inferDateWithAI API error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || '';

    // Extract YYYY-MM-DD using regex
    const match = reply.match(/\d{4}-\d{2}-\d{2}/);
    if (match) {
      return match[0];
    }
    return null;
  } catch (error) {
    console.error('inferDateWithAI error:', error);
    return null;
  }
}

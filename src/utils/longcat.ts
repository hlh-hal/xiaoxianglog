/// <reference types="vite/client" />

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export async function longcatChat(
  messages: ChatMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  let apiKey = import.meta.env.VITE_AI_API_KEY || localStorage.getItem('longcat_api_key') || 'sk-CXaBXrG4CiU2brQe0';

  if (!apiKey) {
    throw new Error('请在 .env 或 localStorage 配置 VITE_AI_API_KEY');
  }

  console.log('Using API Key:', apiKey.substring(0, 5) + '...' + apiKey.substring(apiKey.length - 3));

  let model = opts?.model || import.meta.env.VITE_AI_MODEL || 'xiaomi-mimo';
  let baseUrl = import.meta.env.VITE_AI_BASE_URL || 'http://127.0.0.1:8317/v1';
  
  if (model === 'xiaomi-mimo') {
    baseUrl = 'https://token-plan-cn.xiaomimimo.com/v1';
    apiKey = 'tp-c9v2y0ra8n4swaaqsuvmigzr5dau0vhg2c2y32jmj0cmjc6o';
    model = 'mimo-v2.5';
  }
  
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts?.maxTokens,
      temperature: opts?.temperature,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    console.error('LongCat API Error:', response.status, errorData);
    
    if (response.status === 401) {
      throw new Error('Key 无效 (401)');
    }
    if (response.status === 403) {
      throw new Error('无权限或被拦截 (403)');
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter) {
        throw new Error(`请求频率超限，请稍后重试 (等待 ${retryAfter} 秒)`);
      }
      throw new Error('请求频率超限，请稍后重试');
    }
    throw new Error(errorData?.error?.message || `AI 助手正在连接中，请稍后再试`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
}

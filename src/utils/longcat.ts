import { api } from '../services/apiClient';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export async function longcatChat(
  messages: ChatMessage[],
  opts?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<string> {
  const data = await api.post<{ content: string }>('/chat/complete', {
    modelId: opts?.model || import.meta.env.VITE_AI_MODEL || 'xiaomi-mimo',
    messages,
    maxTokens: opts?.maxTokens,
    temperature: opts?.temperature,
  });

  return data.content || '';
}

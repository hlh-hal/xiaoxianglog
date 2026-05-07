/// <reference types="vite/client" />

import { diaryService, ChatMessage } from './diaryService';
import { apiStreamRequest } from './apiClient';

export interface AIStyle {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  description: string;
  systemPrompt: string;
}

export const AI_STYLES: AIStyle[] = [
  {
    id: 'classic',
    name: '经典小象',
    emoji: '🐘',
    tagline: '温柔、清晰、会共情',
    description: '像一个稳定可靠的陪伴者，先接住情绪，再帮你慢慢想清楚。',
    systemPrompt:
      '你是“小象日志”的 AI 助手。请用自然、温和、真诚的中文和用户对话。先回应当下感受，再给出简洁有帮助的想法，不说教，不端着。',
  },
  {
    id: 'gentle',
    name: '温柔陪伴',
    emoji: '🌷',
    tagline: '更轻柔，更安静',
    description: '偏向陪伴和安抚，适合情绪低落、需要被理解的时候。',
    systemPrompt:
      '你是“小象日志”的 AI 助手，风格偏温柔陪伴。回答时优先理解和安抚用户情绪，语气轻柔克制，避免命令式表达。',
  },
  {
    id: 'tsundere',
    name: '嘴硬知己',
    emoji: '😏',
    tagline: '嘴上别扭，心里偏向你',
    description: '带一点俏皮和吐槽，但底色仍然是关心和站在用户这边。',
    systemPrompt:
      '你是“小象日志”的 AI 助手，风格偏俏皮、嘴硬但真心。可以轻微调侃，但不能攻击、羞辱或让用户难堪，核心仍然是理解与支持。',
  },
  {
    id: 'scholar',
    name: '博学伙伴',
    emoji: '📚',
    tagline: '更擅长梳理和分析',
    description: '适合需要结构化分析、总结规律、一起拆问题的时候。',
    systemPrompt:
      '你是“小象日志”的 AI 助手，风格偏理性清晰。请用结构化、准确、易懂的中文回答，必要时给出简洁分析，但保持温度。',
  },
];

function stripMarkdown(md: string) {
  return md.replace(/[#*`>]/g, '').trim();
}

export async function sendMessage(
  userMessages: ChatMessage[],
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
  modelId?: string
): Promise<void> {
  const entries = await diaryService.getActiveEntries();
  const sorted = [...entries].sort(
    (a, b) => new Date(b.diaryDate).getTime() - new Date(a.diaryDate).getTime()
  );

  let diaryContext = '';
  let charCount = 0;
  const maxContextChars = 30000;

  if (sorted.length === 0) {
    diaryContext = '用户暂无日记。';
  } else {
    for (const entry of sorted) {
      const text = `【${entry.diaryDate.split('T')[0]}】\n${stripMarkdown(entry.content || '').slice(0, 400)}\n\n`;
      if (charCount + text.length > maxContextChars) break;
      diaryContext += text;
      charCount += text.length;
    }
  }

  const currentStyleId = localStorage.getItem('xiang_ai_style') || 'classic';
  const currentStyle = AI_STYLES.find((style) => style.id === currentStyleId) || AI_STYLES[0];

  const systemPrompt = `${currentStyle.systemPrompt}

## 用户日记上下文
这些内容来自用户过去写下的真实日记，不是你写的，共 ${entries.length} 篇。
${diaryContext || '用户暂无日记。'}

## 回答规则
1. 如果用户当前只是闲聊、表达情绪、表白或问一个普通问题，不要主动扯到日记。
2. 只有用户明确让你分析日记，或当前消息本身在引用日记时，才结合日记内容回答。
3. 如果引用日记，请点出大概时间，例如“你在 4 月写过……”。
4. 直接输出最终回答，不要输出推理过程或思维链。`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...userMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  await apiStreamRequest(
    '/chat/message',
    {
      messages,
      modelId: modelId || import.meta.env.VITE_AI_MODEL || 'xiaomi-mimo',
    },
    onChunk,
    signal
  );
}

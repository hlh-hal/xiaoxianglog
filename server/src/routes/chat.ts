import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit, userOrIpKey } from '../middleware/rateLimit.js';
import { paramString } from '../utils/request.js';

const router = Router();
router.use(requireAuth);

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type ProviderConfig = {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  requestedModel: string;
};

const XIAOMI_BASE_URL = process.env.XIAOMI_BASE_URL || 'https://token-plan-cn.xiaomimimo.com/v1';
const XIAOMI_API_KEY = process.env.XIAOMI_API_KEY || '';
const XIAOMI_MODEL = process.env.XIAOMI_MODEL || 'mimo-v2.5';
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 45000);
const PRIMARY_PROVIDER_TIMEOUT_MS = Number(process.env.AI_PRIMARY_TIMEOUT_MS || AI_REQUEST_TIMEOUT_MS);
const THINKING_PROVIDER_TIMEOUT_MS = Number(process.env.AI_THINKING_TIMEOUT_MS || 120000);
const MAX_USER_AI_CONCURRENCY = Number(process.env.AI_MAX_USER_CONCURRENCY || 1);
const MAX_GLOBAL_AI_CONCURRENCY = Number(process.env.AI_MAX_GLOBAL_CONCURRENCY || 8);

const chatRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AI_RATE_LIMIT_PER_MINUTE || 12),
  keyPrefix: 'ai-chat',
  keyGenerator: userOrIpKey,
  message: 'AI 请求太频繁，请稍后再试',
});

const activeAiByUser = new Map<string, number>();
let activeAiGlobal = 0;

class ProviderError extends Error {
  status?: number;
  body?: string;

  constructor(message: string, options?: { status?: number; body?: string; cause?: unknown }) {
    super(message);
    this.name = 'ProviderError';
    this.status = options?.status;
    this.body = options?.body;
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}

function parseMessages(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function normalizeMessages(messages: unknown): ChatMessage[] | null {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 50) return null;

  const normalized = messages.map((message) => {
    const role = (message as ChatMessage)?.role;
    const content = String((message as ChatMessage)?.content || '').slice(0, 12000);
    if (!['system', 'user', 'assistant'].includes(role) || !content.trim()) return null;
    return { role, content } as ChatMessage;
  });

  if (normalized.some((message) => message === null)) return null;
  return normalized as ChatMessage[];
}

function getProviderConfig(modelId?: string): ProviderConfig {
  const requestedModel = modelId || process.env.AI_MODEL || 'xiaomi-mimo';

  if (requestedModel === 'xiaomi-mimo') {
    return {
      name: 'xiaomi-mimo',
      baseUrl: XIAOMI_BASE_URL,
      apiKey: XIAOMI_API_KEY,
      model: XIAOMI_MODEL,
      requestedModel,
    };
  }

  return {
    name: 'cpamc',
    baseUrl: process.env.AI_BASE_URL || 'http://127.0.0.1:8317/v1',
    apiKey: process.env.CPAMC_API_KEY || process.env.AI_API_KEY || '',
    model: requestedModel,
    requestedModel,
  };
}

function getFallbackConfig(): ProviderConfig {
  return {
    name: 'xiaomi-mimo-fallback',
    baseUrl: XIAOMI_BASE_URL,
    apiKey: XIAOMI_API_KEY,
    model: XIAOMI_MODEL,
    requestedModel: 'xiaomi-mimo',
  };
}

function isFallbackEnabled() {
  return process.env.AI_ENABLE_FALLBACK !== 'false' && !!XIAOMI_API_KEY;
}

function getProviderTimeoutMs(provider: ProviderConfig): number {
  if (provider.name === 'cpamc' && provider.requestedModel.includes('Thinking')) {
    return THINKING_PROVIDER_TIMEOUT_MS;
  }

  return provider.name === 'cpamc' ? PRIMARY_PROVIDER_TIMEOUT_MS : AI_REQUEST_TIMEOUT_MS;
}

function acquireAiSlot(userId: string) {
  const userActive = activeAiByUser.get(userId) || 0;
  if (activeAiGlobal >= MAX_GLOBAL_AI_CONCURRENCY || userActive >= MAX_USER_AI_CONCURRENCY) {
    return null;
  }

  activeAiGlobal += 1;
  activeAiByUser.set(userId, userActive + 1);

  return () => {
    activeAiGlobal = Math.max(0, activeAiGlobal - 1);
    const nextUserActive = Math.max(0, (activeAiByUser.get(userId) || 1) - 1);
    if (nextUserActive === 0) {
      activeAiByUser.delete(userId);
    } else {
      activeAiByUser.set(userId, nextUserActive);
    }
  };
}

async function requestCompletion(provider: ProviderConfig, messages: ChatMessage[], stream: boolean, options?: {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: unknown;
}) {
  if (!provider.apiKey) {
    throw new ProviderError('AI provider API key is not configured', { status: 503 });
  }

  const cleanBaseUrl = provider.baseUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getProviderTimeoutMs(provider));

  try {
    return await fetch(`${cleanBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
        response_format: options?.responseFormat,
        stream,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ProviderError('AI provider request failed', { cause: error });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestProvider(provider: ProviderConfig, messages: ChatMessage[], startedAt: number) {
  console.log(
    `[ai] request requestedModel=${provider.requestedModel} provider=${provider.name} targetModel=${provider.model}`,
  );

  const response = await requestCompletion(provider, messages, true);

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new ProviderError('AI provider returned an error', {
      status: response.status,
      body: errorText,
    });
  }

  console.log(
    `[ai] provider_ready requestedModel=${provider.requestedModel} provider=${provider.name} targetModel=${provider.model} elapsedMs=${Date.now() - startedAt}`,
  );
  return response;
}

function logProviderError(prefix: string, provider: ProviderConfig, startedAt: number, error: unknown) {
  if (error instanceof ProviderError) {
    console.warn(
      `[ai] ${prefix} requestedModel=${provider.requestedModel} provider=${provider.name} targetModel=${provider.model} status=${error.status ?? 'exception'} elapsedMs=${Date.now() - startedAt} body=${JSON.stringify(error.body || error.message)}`,
      error.cause || '',
    );
    return;
  }

  console.warn(
    `[ai] ${prefix} requestedModel=${provider.requestedModel} provider=${provider.name} targetModel=${provider.model} status=exception elapsedMs=${Date.now() - startedAt}`,
    error,
  );
}

async function requestWithFallback(primary: ProviderConfig, messages: ChatMessage[], startedAt: number) {
  const fallbackEnabled = primary.name !== 'xiaomi-mimo' && isFallbackEnabled();

  try {
    return await requestProvider(primary, messages, startedAt);
  } catch (primaryError) {
    logProviderError('primary_failed', primary, startedAt, primaryError);

    if (!fallbackEnabled) {
      throw primaryError;
    }

    const fallback = getFallbackConfig();
    try {
      const response = await requestProvider(fallback, messages, startedAt);
      console.warn(
        `[ai] fallback_succeeded requestedModel=${primary.requestedModel} fallbackProvider=${fallback.name} fallbackModel=${fallback.model} elapsedMs=${Date.now() - startedAt}`,
      );
      return response;
    } catch (fallbackError) {
      logProviderError('fallback_failed', fallback, startedAt, fallbackError);
      throw fallbackError;
    }
  }
}

async function pipeStream(response: globalThis.Response, res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = response.body?.getReader();
  if (!reader) {
    res.status(500).json({ error: 'AI service returned an empty stream' });
    return;
  }

  const decoder = new TextDecoder();
  let closed = false;
  const cancelUpstream = () => {
    closed = true;
    reader.cancel().catch(() => undefined);
  };

  res.on('close', cancelUpstream);

  try {
    while (true) {
      if (closed || res.destroyed || res.writableEnded) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (!closed && !res.destroyed && !res.writableEnded) {
        res.write(decoder.decode(value, { stream: true }));
      }
    }
  } catch (error) {
    if (!closed) {
      console.warn('[ai] stream_pipe_failed', error);
    }
  } finally {
    res.off('close', cancelUpstream);
    if (!res.destroyed && !res.writableEnded) {
      res.end();
    }
  }
}

router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.chatSession.findMany({
      where: { userId: req.user!.userId },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(sessions.map(s => ({
      ...s,
      messages: parseMessages(s.messages),
    })));
  } catch {
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const sessionId = paramString(req, 'id');
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId: req.user!.userId },
    });
    if (!session) {
      res.status(404).json({ error: '会话不存在' });
      return;
    }
    res.json({ ...session, messages: parseMessages(session.messages) });
  } catch {
    res.status(500).json({ error: '获取会话失败' });
  }
});

router.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { id, title, styleId, pinned, messages } = req.body;
    const safeMessages = Array.isArray(messages) ? messages.slice(0, 200) : [];

    if (id) {
      const data = {
        ...(title !== undefined && { title: String(title).slice(0, 80) }),
        ...(styleId !== undefined && { styleId: String(styleId).slice(0, 40) }),
        ...(pinned !== undefined && { pinned: Boolean(pinned) }),
        ...(messages !== undefined && { messages: JSON.stringify(safeMessages) }),
      };
      const result = await prisma.chatSession.updateMany({
        where: { id: String(id), userId: req.user!.userId },
        data,
      });
      const session = result.count > 0
        ? await prisma.chatSession.findFirst({ where: { id: String(id), userId: req.user!.userId } })
        : await prisma.chatSession.create({
            data: {
              id: String(id),
              userId: req.user!.userId,
              title: String(title || '新对话').slice(0, 80),
              styleId: styleId ? String(styleId).slice(0, 40) : undefined,
              pinned: Boolean(pinned),
              messages: JSON.stringify(safeMessages),
            },
          });
      res.json(session ? { ...session, messages: parseMessages(session.messages) } : null);
      return;
    }

    const session = await prisma.chatSession.create({
      data: {
        userId: req.user!.userId,
        title: String(title || '新对话').slice(0, 80),
        styleId: styleId ? String(styleId).slice(0, 40) : undefined,
        pinned: Boolean(pinned),
        messages: JSON.stringify(safeMessages),
      },
    });
    res.status(201).json({ ...session, messages: parseMessages(session.messages) });
  } catch {
    res.status(500).json({ error: '保存会话失败' });
  }
});

router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const sessionId = paramString(req, 'id');
    await prisma.chatSession.deleteMany({
      where: { id: sessionId, userId: req.user!.userId },
    });
    res.json({ message: '已删除' });
  } catch {
    res.status(500).json({ error: '删除失败' });
  }
});

router.post('/complete', chatRateLimit, async (req: Request, res: Response) => {
  const { messages, modelId, temperature, maxTokens, responseFormat } = req.body as {
    messages?: ChatMessage[];
    modelId?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: unknown;
  };
  const normalizedMessages = normalizeMessages(messages);

  if (!normalizedMessages) {
    res.status(400).json({ error: '消息不能为空' });
    return;
  }

  const release = acquireAiSlot(req.user!.userId);
  if (!release) {
    res.status(429).json({ error: 'AI 正在忙，请稍后再试' });
    return;
  }

  const primary = getProviderConfig(modelId);
  const startedAt = Date.now();

  try {
    const response = await requestCompletion(primary, normalizedMessages, false, {
      temperature,
      maxTokens,
      responseFormat,
    });

    if (!response.ok) {
      throw new ProviderError('AI provider returned an error', {
        status: response.status,
        body: await response.text().catch(() => ''),
      });
    }

    const data = await response.json();
    res.json({ content: data.choices?.[0]?.message?.content || '' });
  } catch (err: any) {
    console.error(
      `[ai] complete_exception requestedModel=${primary.requestedModel} provider=${primary.name} targetModel=${primary.model} elapsedMs=${Date.now() - startedAt}`,
      err,
    );
    res.status(500).json({ error: 'AI 服务暂时不可用' });
  } finally {
    release();
  }
});

router.post('/message', chatRateLimit, async (req: Request, res: Response) => {
  const { messages, modelId } = req.body as { messages?: ChatMessage[]; modelId?: string };
  const normalizedMessages = normalizeMessages(messages);

  if (!normalizedMessages) {
    res.status(400).json({ error: '消息不能为空' });
    return;
  }

  const release = acquireAiSlot(req.user!.userId);
  if (!release) {
    res.status(429).json({ error: 'AI 正在忙，请稍后再试' });
    return;
  }

  const primary = getProviderConfig(modelId);
  const startedAt = Date.now();

  try {
    const response = await requestWithFallback(primary, normalizedMessages, startedAt);
    await pipeStream(response, res);
  } catch (err: any) {
    console.error(
      `[ai] request_exception requestedModel=${primary.requestedModel} provider=${primary.name} targetModel=${primary.model} elapsedMs=${Date.now() - startedAt}`,
      err,
    );

    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
  } finally {
    release();
  }
});

export default router;

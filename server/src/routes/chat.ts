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
const XIAOMI_API_KEY = process.env.XIAOMI_API_KEY || process.env.AI_API_KEY || '';
const XIAOMI_MODEL = process.env.XIAOMI_MODEL || 'mimo-v2.5';
const CPAMC_BASE_URL = process.env.CPAMC_BASE_URL || '';
const CPAMC_API_KEY = process.env.CPAMC_API_KEY || '';
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 45000);
const PRIMARY_PROVIDER_TIMEOUT_MS = Number(process.env.AI_PRIMARY_TIMEOUT_MS || AI_REQUEST_TIMEOUT_MS);
const THINKING_PROVIDER_TIMEOUT_MS = Number(process.env.AI_THINKING_TIMEOUT_MS || 120000);
const MAX_USER_AI_CONCURRENCY = Number(process.env.AI_MAX_USER_CONCURRENCY || 1);
const MAX_GLOBAL_AI_CONCURRENCY = Number(process.env.AI_MAX_GLOBAL_CONCURRENCY || 8);
const AI_DEBUG_ERRORS = process.env.AI_DEBUG_ERRORS === 'true';

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

function summarizeProviderError(error: unknown): string {
  if (error instanceof ProviderError) {
    const body = error.body ? ` ${error.body.slice(0, 300)}` : '';
    const cause = error.cause instanceof Error ? ` ${error.cause.message}` : '';
    return `${error.status ?? 'exception'} ${error.message}${body}${cause}`.trim();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function providerErrorResponse(error: unknown) {
  if (!AI_DEBUG_ERRORS) {
    return { error: 'AI 服务暂时不可用' };
  }

  return {
    error: 'AI 服务暂时不可用',
    detail: summarizeProviderError(error),
  };
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
    baseUrl: CPAMC_BASE_URL,
    apiKey: CPAMC_API_KEY,
    model: requestedModel,
    requestedModel,
  };
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

function buildChatCompletionsUrl(provider: ProviderConfig) {
  const cleanBaseUrl = provider.baseUrl.replace(/\/+$/, '');
  if (cleanBaseUrl.endsWith('/chat/completions')) {
    return cleanBaseUrl;
  }

  return `${cleanBaseUrl}/chat/completions`;
}

async function requestCompletion(provider: ProviderConfig, messages: ChatMessage[], stream: boolean, options?: {
  temperature?: number;
  maxTokens?: number;
  responseFormat?: unknown;
}) {
  if (!provider.apiKey) {
    throw new ProviderError('AI provider API key is not configured', { status: 503 });
  }
  if (!provider.baseUrl) {
    throw new ProviderError('AI provider base URL is not configured', { status: 503 });
  }

  const chatCompletionsUrl = buildChatCompletionsUrl(provider);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getProviderTimeoutMs(provider));

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    };

    return await fetch(chatCompletionsUrl, {
      method: 'POST',
      headers,
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
    `[ai] request requestedModel=${provider.requestedModel} provider=${provider.name} targetModel=${provider.model} baseUrl=${provider.baseUrl}`,
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

router.get('/cpamc/status', async (_req: Request, res: Response) => {
  const provider = getProviderConfig('LongCat-Flash-Lite');
  const status = {
    provider: provider.name,
    baseUrl: provider.baseUrl || null,
    keyConfigured: Boolean(provider.apiKey),
    models: null as null | { ok: boolean; status: number; hasLongCatLite: boolean; hasLongCatThinking: boolean; body: string },
    completion: null as null | { ok: boolean; status: number; body: string },
  };

  try {
    const modelsResponse = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const body = await modelsResponse.text();
    status.models = {
      ok: modelsResponse.ok,
      status: modelsResponse.status,
      hasLongCatLite: body.includes('LongCat-Flash-Lite'),
      hasLongCatThinking: body.includes('LongCat-Flash-Thinking-2601'),
      body: body.slice(0, 500),
    };
  } catch (error) {
    status.models = {
      ok: false,
      status: 0,
      hasLongCatLite: false,
      hasLongCatThinking: false,
      body: summarizeProviderError(error),
    };
  }

  try {
    const completionResponse = await requestCompletion(provider, [{ role: 'user', content: '只回复 OK' }], false, {
      maxTokens: 16,
    });
    const body = await completionResponse.text();
    status.completion = {
      ok: completionResponse.ok,
      status: completionResponse.status,
      body: body.slice(0, 500),
    };
  } catch (error) {
    status.completion = {
      ok: false,
      status: 0,
      body: summarizeProviderError(error),
    };
  }

  res.json(status);
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
    res.status(500).json(providerErrorResponse(err));
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
    const response = await requestProvider(primary, normalizedMessages, startedAt);
    await pipeStream(response, res);
  } catch (err: any) {
    console.error(
      `[ai] request_exception requestedModel=${primary.requestedModel} provider=${primary.name} targetModel=${primary.model} elapsedMs=${Date.now() - startedAt}`,
      err,
    );

    if (!res.headersSent) {
      res.status(500).json(providerErrorResponse(err));
    }
  } finally {
    release();
  }
});

export default router;

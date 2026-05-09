import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

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

const XIAOMI_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1';
const XIAOMI_API_KEY = 'tp-c9v2y0ra8n4swaaqsuvmigzr5dau0vhg2c2y32jmj0cmjc6o';
const XIAOMI_MODEL = 'mimo-v2.5';
const AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 45000);
const PRIMARY_PROVIDER_TIMEOUT_MS = Number(process.env.AI_PRIMARY_TIMEOUT_MS || AI_REQUEST_TIMEOUT_MS);
const THINKING_PROVIDER_TIMEOUT_MS = Number(process.env.AI_THINKING_TIMEOUT_MS || 120000);

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
  return process.env.AI_ENABLE_FALLBACK !== 'false';
}

function getProviderTimeoutMs(provider: ProviderConfig): number {
  if (provider.name === 'cpamc' && provider.requestedModel.includes('Thinking')) {
    return THINKING_PROVIDER_TIMEOUT_MS;
  }

  return provider.name === 'cpamc' ? PRIMARY_PROVIDER_TIMEOUT_MS : AI_REQUEST_TIMEOUT_MS;
}

async function requestCompletion(provider: ProviderConfig, messages: ChatMessage[]) {
  const cleanBaseUrl = provider.baseUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getProviderTimeoutMs(provider));

  try {
    return await fetch(`${cleanBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: true,
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

  const response = await requestCompletion(provider, messages);

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
    const sessionId = String(req.params.id || '');
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

    if (id) {
      const data = {
        ...(title !== undefined && { title }),
        ...(styleId !== undefined && { styleId }),
        ...(pinned !== undefined && { pinned }),
        ...(messages !== undefined && { messages: JSON.stringify(messages) }),
      };
      const result = await prisma.chatSession.updateMany({
        where: { id, userId: req.user!.userId },
        data,
      });
      const session = result.count > 0
        ? await prisma.chatSession.findFirst({ where: { id, userId: req.user!.userId } })
        : await prisma.chatSession.create({
            data: {
              id,
              userId: req.user!.userId,
              title: title || '新对话',
              styleId,
              pinned: pinned || false,
              messages: JSON.stringify(messages || []),
            },
          });
      res.json(session ? { ...session, messages: parseMessages(session.messages) } : null);
      return;
    }

    const session = await prisma.chatSession.create({
      data: {
        userId: req.user!.userId,
        title: title || '新对话',
        styleId,
        pinned: pinned || false,
        messages: JSON.stringify(messages || []),
      },
    });
    res.status(201).json({ ...session, messages: parseMessages(session.messages) });
  } catch {
    res.status(500).json({ error: '保存会话失败' });
  }
});

router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const sessionId = String(req.params.id || '');
    await prisma.chatSession.deleteMany({
      where: { id: sessionId, userId: req.user!.userId },
    });
    res.json({ message: '已删除' });
  } catch {
    res.status(500).json({ error: '删除失败' });
  }
});

router.post('/message', async (req: Request, res: Response) => {
  const { messages, modelId } = req.body as { messages?: ChatMessage[]; modelId?: string };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: '消息不能为空' });
    return;
  }

  const primary = getProviderConfig(modelId);
  const startedAt = Date.now();

  try {
    const response = await requestWithFallback(primary, messages, startedAt);
    await pipeStream(response, res);
  } catch (err: any) {
    console.error(
      `[ai] request_exception requestedModel=${primary.requestedModel} provider=${primary.name} targetModel=${primary.model} elapsedMs=${Date.now() - startedAt}`,
      err,
    );

    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
  }
});

export default router;

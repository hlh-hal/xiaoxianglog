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

async function requestCompletion(provider: ProviderConfig, messages: ChatMessage[]) {
  const cleanBaseUrl = provider.baseUrl.replace(/\/$/, '');
  return fetch(`${cleanBaseUrl}/chat/completions`, {
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
  });
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
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } finally {
    res.end();
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
  const fallbackEnabled = primary.name !== 'xiaomi-mimo' && isFallbackEnabled();
  const startedAt = Date.now();

  try {
    console.log(
      `[ai] request requestedModel=${primary.requestedModel} provider=${primary.name} targetModel=${primary.model} baseUrl=${primary.baseUrl}`,
    );
    let response = await requestCompletion(primary, messages);

    if (!response.ok && fallbackEnabled) {
      const errorText = await response.text().catch(() => '');
      console.warn(
        `[ai] primary_failed requestedModel=${primary.requestedModel} provider=${primary.name} targetModel=${primary.model} status=${response.status} elapsedMs=${Date.now() - startedAt} fallback=true body=${JSON.stringify(errorText)}`,
      );

      const fallback = getFallbackConfig();
      response = await requestCompletion(fallback, messages);

      if (response.ok) {
        console.warn(
          `[ai] fallback_succeeded requestedModel=${primary.requestedModel} fallbackProvider=${fallback.name} fallbackModel=${fallback.model} elapsedMs=${Date.now() - startedAt}`,
        );
      } else {
        const fallbackErrorText = await response.text().catch(() => 'Unknown error');
        console.error(
          `[ai] fallback_failed requestedModel=${primary.requestedModel} fallbackProvider=${fallback.name} fallbackModel=${fallback.model} status=${response.status} elapsedMs=${Date.now() - startedAt} body=${JSON.stringify(fallbackErrorText)}`,
        );
        res.status(response.status).json({ error: `AI 服务错误: ${fallbackErrorText}` });
        return;
      }
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(
        `[ai] request_failed requestedModel=${primary.requestedModel} provider=${primary.name} targetModel=${primary.model} status=${response.status} elapsedMs=${Date.now() - startedAt} body=${JSON.stringify(errorText)}`,
      );
      res.status(response.status).json({ error: `AI 服务错误: ${errorText}` });
      return;
    }

    await pipeStream(response, res);
  } catch (err: any) {
    console.error(
      `[ai] request_exception requestedModel=${primary.requestedModel} provider=${primary.name} targetModel=${primary.model} elapsedMs=${Date.now() - startedAt}`,
      err,
    );

    if (fallbackEnabled) {
      try {
        const fallback = getFallbackConfig();
        const fallbackResponse = await requestCompletion(fallback, messages);
        if (fallbackResponse.ok) {
          console.warn(
            `[ai] fallback_succeeded_after_exception requestedModel=${primary.requestedModel} fallbackProvider=${fallback.name} fallbackModel=${fallback.model} elapsedMs=${Date.now() - startedAt}`,
          );
          await pipeStream(fallbackResponse, res);
          return;
        }

        const fallbackErrorText = await fallbackResponse.text().catch(() => 'Unknown error');
        console.error(
          `[ai] fallback_failed_after_exception requestedModel=${primary.requestedModel} fallbackProvider=${fallback.name} fallbackModel=${fallback.model} status=${fallbackResponse.status} elapsedMs=${Date.now() - startedAt} body=${JSON.stringify(fallbackErrorText)}`,
        );
      } catch (fallbackErr) {
        console.error(
          `[ai] fallback_exception requestedModel=${primary.requestedModel} elapsedMs=${Date.now() - startedAt}`,
          fallbackErr,
        );
      }
    }

    if (!res.headersSent) {
      res.status(500).json({ error: 'AI 服务暂时不可用' });
    }
  }
});

export default router;

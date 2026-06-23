import './env.js';

export type AiMessage = {
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

export type AiCompletionResult = {
  content: string;
  finishReason: string | null;
  aiModel: string;
  provider: string;
};

export class AiProviderError extends Error {
  status?: number;
  body?: string;

  constructor(message: string, options?: { status?: number; body?: string; cause?: unknown }) {
    super(message);
    this.name = 'AiProviderError';
    this.status = options?.status;
    this.body = options?.body;
    if (options?.cause) this.cause = options.cause;
  }
}

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

const activeAiByUser = new Map<string, number>();
let activeAiGlobal = 0;

export function getDefaultAiModelId(): string {
  return process.env.AI_MODEL || 'xiaomi-mimo';
}

function getProviderConfig(modelId?: string): ProviderConfig {
  const requestedModel = modelId || getDefaultAiModelId();
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

function buildChatCompletionsUrl(provider: ProviderConfig) {
  const cleanBaseUrl = provider.baseUrl.replace(/\/+$/, '');
  return cleanBaseUrl.endsWith('/chat/completions')
    ? cleanBaseUrl
    : `${cleanBaseUrl}/chat/completions`;
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
    if (nextUserActive === 0) activeAiByUser.delete(userId);
    else activeAiByUser.set(userId, nextUserActive);
  };
}

export async function completeAiText(args: {
  userId: string;
  messages: AiMessage[];
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: unknown;
}): Promise<AiCompletionResult> {
  const provider = getProviderConfig(args.modelId);
  if (!provider.apiKey) throw new AiProviderError('AI provider API key is not configured', { status: 503 });
  if (!provider.baseUrl) throw new AiProviderError('AI provider base URL is not configured', { status: 503 });

  const release = acquireAiSlot(args.userId);
  if (!release) throw new AiProviderError('AI concurrency limit reached', { status: 429 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getProviderTimeoutMs(provider));
  const startedAt = Date.now();

  try {
    const response = await fetch(buildChatCompletionsUrl(provider), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: args.messages,
        max_tokens: args.maxTokens,
        temperature: args.temperature,
        response_format: args.responseFormat,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new AiProviderError('AI provider returned an error', {
        status: response.status,
        body: await response.text().catch(() => ''),
      });
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    console.log(
      `[ai] complete provider=${provider.name} targetModel=${provider.model} elapsedMs=${Date.now() - startedAt}`,
    );

    return {
      content: choice?.message?.content || '',
      finishReason: choice?.finish_reason || null,
      aiModel: provider.model,
      provider: provider.name,
    };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    throw new AiProviderError('AI provider request failed', { cause: error });
  } finally {
    clearTimeout(timeout);
    release();
  }
}

const DEFAULT_WECHAT_API_BASE_URL = 'https://api.weixin.qq.com';

type FetchLike = typeof fetch;

type WechatApiErrorPayload = {
  errcode?: number;
  errmsg?: string;
};

type WechatTokenPayload = WechatApiErrorPayload & {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  openid?: string;
  scope?: string;
  unionid?: string;
};

type WechatUserInfoPayload = WechatApiErrorPayload & {
  openid?: string;
  nickname?: string;
  headimgurl?: string;
  unionid?: string;
};

export type WechatProfile = {
  appId: string;
  openId: string;
  unionId?: string;
  nickname?: string;
  avatarUrl?: string;
};

export type WechatConfig = {
  enabled: boolean;
  appId: string;
  appSecret: string;
};

export class WechatAuthError extends Error {
  public readonly publicMessage: string;

  constructor(message: string, publicMessage = '微信授权失败，请稍后重试') {
    super(message);
    this.name = 'WechatAuthError';
    this.publicMessage = publicMessage;
  }
}

export function getWechatConfig(): WechatConfig {
  const appId = String(process.env.WECHAT_APP_ID || '').trim();
  const appSecret = String(process.env.WECHAT_APP_SECRET || '').trim();
  const enabled = process.env.WECHAT_LOGIN_ENABLED === 'true' && !!appId && !!appSecret;
  return { enabled, appId, appSecret };
}

export function getRequiredWechatConfig(): WechatConfig {
  const config = getWechatConfig();
  if (!config.enabled) {
    throw new WechatAuthError('WeChat login is disabled or incomplete', '微信登录尚未启用');
  }
  return config;
}

export function buildWechatUnionKey(unionId?: string | null): string | null {
  const normalized = String(unionId || '').trim();
  return normalized ? `wechat:${normalized}` : null;
}

function normalizeNickname(value?: string): string | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  return Array.from(trimmed).slice(0, 32).join('');
}

function normalizeAvatarUrl(value?: string): string | undefined {
  const trimmed = String(value || '').trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice('http://'.length)}`;
  return trimmed.startsWith('https://') ? trimmed : undefined;
}

async function fetchWechatJson<T extends WechatApiErrorPayload>(
  url: URL,
  fetchImpl: FetchLike,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    throw new WechatAuthError(`WeChat request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  if (!response.ok) {
    throw new WechatAuthError(`WeChat request returned HTTP ${response.status}`);
  }

  const payload = await response.json() as T;
  if (payload.errcode) {
    const publicMessage = payload.errcode === 40029
      ? '微信授权已失效，请重新授权'
      : '微信授权失败，请稍后重试';
    throw new WechatAuthError(`WeChat API error ${payload.errcode}: ${payload.errmsg || 'unknown'}`, publicMessage);
  }
  return payload;
}

/**
 * 使用 Android 微信 SDK 返回的一次性 code 换取可信微信身份。
 * AppSecret 和 access token 始终只存在于服务端内存中。
 */
export async function exchangeWechatCode(
  code: string,
  fetchImpl: FetchLike = fetch,
  apiBaseUrl = process.env.WECHAT_API_BASE_URL || DEFAULT_WECHAT_API_BASE_URL,
): Promise<WechatProfile> {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode || normalizedCode.length > 512) {
    throw new WechatAuthError('Invalid WeChat authorization code', '微信授权信息不正确，请重新授权');
  }

  const config = getRequiredWechatConfig();
  const tokenUrl = new URL('/sns/oauth2/access_token', apiBaseUrl);
  tokenUrl.searchParams.set('appid', config.appId);
  tokenUrl.searchParams.set('secret', config.appSecret);
  tokenUrl.searchParams.set('code', normalizedCode);
  tokenUrl.searchParams.set('grant_type', 'authorization_code');

  const token = await fetchWechatJson<WechatTokenPayload>(tokenUrl, fetchImpl);
  const accessToken = String(token.access_token || '').trim();
  const openId = String(token.openid || '').trim();
  if (!accessToken || !openId) {
    throw new WechatAuthError('WeChat token response is missing access_token or openid');
  }

  const userInfoUrl = new URL('/sns/userinfo', apiBaseUrl);
  userInfoUrl.searchParams.set('access_token', accessToken);
  userInfoUrl.searchParams.set('openid', openId);
  userInfoUrl.searchParams.set('lang', 'zh_CN');

  const userInfo = await fetchWechatJson<WechatUserInfoPayload>(userInfoUrl, fetchImpl);
  if (String(userInfo.openid || '').trim() !== openId) {
    throw new WechatAuthError('WeChat userinfo openid does not match token response');
  }

  const unionId = String(userInfo.unionid || token.unionid || '').trim() || undefined;
  return {
    appId: config.appId,
    openId,
    unionId,
    nickname: normalizeNickname(userInfo.nickname),
    avatarUrl: normalizeAvatarUrl(userInfo.headimgurl),
  };
}

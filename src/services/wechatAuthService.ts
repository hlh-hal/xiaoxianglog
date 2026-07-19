import { Capacitor, registerPlugin } from '@capacitor/core';
import { api, saveTokens } from './apiClient';
import { authService, type Session } from './authService';

type XiangWechatPlugin = {
  isInstalled(options: { appId: string }): Promise<{ installed: boolean; supported: boolean }>;
  authorize(options: { appId: string }): Promise<{ code: string }>;
  consumePendingResult(): Promise<{ available: boolean; pending?: boolean; code?: string }>;
};

export type WechatConfig = {
  enabled: boolean;
  appId: string;
};

export type WechatRegistrationDraft = {
  registrationToken: string;
  wechatProfile: {
    nickname?: string;
    avatarUrl?: string;
  };
  expiresAt: number;
};

type AuthResponse = {
  user: { id: string; email: string; nickname: string; avatarUrl?: string | null; bio?: string | null };
  accessToken: string;
  refreshToken: string;
};

type WechatLoginResponse =
  | ({ status: 'authenticated' } & AuthResponse)
  | {
      status: 'registration_required';
      registrationToken: string;
      wechatProfile: { nickname?: string; avatarUrl?: string };
      expiresIn: number;
    };

const XiangWechat = registerPlugin<XiangWechatPlugin>('XiangWechat');
const REGISTRATION_DRAFT_KEY = 'xiang_wechat_registration_draft';

function isAndroidNative() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function toSession(data: AuthResponse['user']): Session {
  return {
    userId: data.id,
    email: data.email,
    nickname: data.nickname,
    avatarUrl: data.avatarUrl || undefined,
    bio: data.bio || undefined,
  };
}

function persistAuthenticatedResponse(data: AuthResponse) {
  saveTokens(data.accessToken, data.refreshToken);
  const session = toSession(data.user);
  authService.setSession(session);
  return session;
}

export const wechatAuthService = {
  isAndroidNative,

  async getConfig(): Promise<WechatConfig> {
    if (!isAndroidNative()) return { enabled: false, appId: '' };
    return api.get<WechatConfig>('/auth/wechat/config');
  },

  async ensureInstalled(config: WechatConfig) {
    if (!isAndroidNative()) throw new Error('微信登录仅支持 Android 客户端');
    if (!config.enabled || !config.appId) throw new Error('微信登录尚未启用');
    const result = await XiangWechat.isInstalled({ appId: config.appId });
    if (!result.installed) throw new Error('请先安装微信客户端');
  },

  async authorize(config: WechatConfig): Promise<string> {
    await this.ensureInstalled(config);
    const result = await XiangWechat.authorize({ appId: config.appId });
    if (!result.code) throw new Error('微信未返回授权信息，请重新授权');
    return result.code;
  },

  async consumePendingAuthorization(): Promise<string | null> {
    if (!isAndroidNative()) return null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await XiangWechat.consumePendingResult();
      if (result.available && result.code) return result.code;
      if (!result.pending) return null;
      await new Promise(resolve => window.setTimeout(resolve, 250));
    }
    return null;
  },

  async loginWithCode(code: string): Promise<
    | { status: 'authenticated'; session: Session }
    | { status: 'registration_required'; draft: WechatRegistrationDraft }
  > {
    const data = await api.post<WechatLoginResponse>('/auth/wechat/login', { code });
    if (data.status === 'authenticated') {
      this.clearRegistrationDraft();
      return { status: 'authenticated', session: persistAuthenticatedResponse(data) };
    }

    const draft: WechatRegistrationDraft = {
      registrationToken: data.registrationToken,
      wechatProfile: data.wechatProfile || {},
      expiresAt: Date.now() + data.expiresIn * 1000,
    };
    sessionStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(draft));
    return { status: 'registration_required', draft };
  },

  getRegistrationDraft(): WechatRegistrationDraft | null {
    const raw = sessionStorage.getItem(REGISTRATION_DRAFT_KEY);
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw) as WechatRegistrationDraft;
      if (!draft.registrationToken || draft.expiresAt <= Date.now()) {
        this.clearRegistrationDraft();
        return null;
      }
      return draft;
    } catch {
      this.clearRegistrationDraft();
      return null;
    }
  },

  clearRegistrationDraft() {
    sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);
  },

  async register(input: {
    email: string;
    nickname: string;
    password: string;
    verificationToken: string;
    registrationToken: string;
  }): Promise<Session> {
    const data = await api.post<AuthResponse>('/auth/wechat/register', {
      ...input,
      acceptedTerms: true,
    });
    const session = persistAuthenticatedResponse(data);
    this.clearRegistrationDraft();
    return session;
  },

  async getBinding(): Promise<{ bound: boolean; boundAt: string | null }> {
    return api.get('/auth/wechat/binding');
  },

  async requestBindingEmailCode(action: 'link' | 'unlink'): Promise<{ devCode?: string }> {
    return api.post('/auth/wechat/email-code', { action });
  },

  async link(config: WechatConfig, emailCode: string): Promise<void> {
    const wechatCode = await this.authorize(config);
    await api.post('/auth/wechat/link', { wechatCode, emailCode });
  },

  async unlink(emailCode: string): Promise<void> {
    await api.post('/auth/wechat/unlink', { emailCode });
  },
};

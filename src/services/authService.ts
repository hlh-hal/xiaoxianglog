import { api, saveTokens, clearTokens, getAccessToken } from './apiClient';
import { diaryService } from './diaryService';

export type Session = {
  userId: string;
  email: string;
  nickname: string;
  avatarUrl?: string;
  bio?: string;
};

// 兼容遗留的本地缓存键，用于离线恢复（可选）
const SESSION_KEY = 'app_session';

function compactSession(session: Session): Session {
  const avatarUrl = session.avatarUrl && !/^data:/i.test(session.avatarUrl) && session.avatarUrl.length < 2048
    ? session.avatarUrl
    : undefined;
  return { ...session, avatarUrl };
}

function isQuotaError(error: unknown): boolean {
  return error instanceof DOMException
    && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
}

export const authService = {
  // 从本地存储获取会话（用于初始化前临时显示）
  getSession(): Session | null {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  },

  setSession(session: Session | null) {
    if (session) {
      localStorage.removeItem(SESSION_KEY);
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(compactSession(session)));
      } catch (error) {
        console.warn('Failed to save full session, retrying without avatar:', error);
        const { avatarUrl: _avatarUrl, ...safeSession } = session;
        localStorage.removeItem(SESSION_KEY);
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(safeSession));
        } catch (retryError) {
          if (!isQuotaError(retryError)) {
            console.warn('Failed to save compact session:', retryError);
          }
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  },

  // 异步获取最新会话
  async fetchSession(): Promise<Session | null> {
    const token = getAccessToken();
    if (!token) {
      this.setSession(null);
      return null;
    }
    try {
      const user = await api.get('/auth/me');
      const session: Session = {
        userId: user.id,
        email: user.email,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl || undefined,
        bio: user.bio || undefined,
      };
      this.setSession(session);
      return session;
    } catch (err) {
      console.error('Failed to fetch session:', err);
      // 如果获取失败（如 token 失效），apiClient 会尝试 refresh。如果最终失败，抛出异常或返回空
      this.setSession(null);
      clearTokens();
      return null;
    }
  },

  async login(email: string, passwordHash: string): Promise<Session> {
    const data = await api.post('/auth/login', { email, password: passwordHash });
    saveTokens(data.accessToken, data.refreshToken);
    
    const session: Session = {
      userId: data.user.id,
      email: data.user.email,
      nickname: data.user.nickname,
      avatarUrl: data.user.avatarUrl || undefined,
      bio: data.user.bio || undefined,
    };
    this.setSession(session);
    return session;
  },

  async logout(): Promise<void> {
    clearTokens();
    this.setSession(null);
  },

  async requestEmailCode(email: string, type: 'register' | 'reset'): Promise<{ devCode?: string }> {
    const data = await api.post('/auth/send-code', { email, type });
    return { devCode: data.devCode };
  },

  async verifyEmailCode(email: string, code: string, type: 'register' | 'reset'): Promise<string> {
    const data = await api.post('/auth/verify-code', { email, code, type });
    return data.verificationToken;
  },

  async register(email: string, nickname: string, passwordHash: string, verificationToken: string): Promise<Session> {
    const data = await api.post('/auth/register', { email, nickname, password: passwordHash, verificationToken });
    saveTokens(data.accessToken, data.refreshToken);
    
    const session: Session = {
      userId: data.user.id,
      email: data.user.email,
      nickname: data.user.nickname,
      avatarUrl: data.user.avatarUrl || undefined,
      bio: data.user.bio || undefined,
    };
    this.setSession(session);
    return session;
  },

  async resetPassword(email: string, newPasswordHash: string, verificationToken: string): Promise<void> {
    await api.post('/auth/forgot-password', { email, newPassword: newPasswordHash, verificationToken });
  },

  async updateProfile(updates: Partial<Session>): Promise<Session> {
    const data = await api.put('/auth/me', {
      nickname: updates.nickname,
      bio: updates.bio,
      avatarUrl: updates.avatarUrl,
    });
    
    const session: Session = {
      userId: data.id,
      email: data.email,
      nickname: data.nickname,
      avatarUrl: data.avatarUrl || undefined,
      bio: data.bio || undefined,
    };
    this.setSession(session);
    return session;
  },

  async deleteAccount(): Promise<void> {
    await api.delete('/auth/me');
    await diaryService.clearLocalUserData();
    clearTokens();
    this.setSession(null);
    localStorage.removeItem('xiang_current_user');
  }
};

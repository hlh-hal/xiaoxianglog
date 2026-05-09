/**
 * 前端 API 客户端
 * 统一处理 HTTP 请求、JWT Token 管理、自动刷新
 */

const API_BASE = '/api';

// Token 存储键
const ACCESS_TOKEN_KEY = 'xiang_access_token';
const REFRESH_TOKEN_KEY = 'xiang_refresh_token';

/**
 * 获取存储的 Token
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * 保存 Token
 */
export function saveTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/**
 * 清除 Token
 */
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * 是否已登录
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/**
 * 刷新 Token
 */
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // 防止并发刷新
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        clearTokens();
        return false;
      }

      const data = await res.json();
      saveTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * 核心请求方法
 */
export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // 如果不是 FormData，设置 Content-Type
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  // 添加认证头
  const token = getAccessToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res = await fetch(url, { ...options, headers });

  // 如果 401，尝试刷新 Token 后重试
  if (res.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getAccessToken()}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: '请求失败' }));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }

  return res.json();
}

/**
 * 流式请求（用于 AI 聊天）
 */
export async function apiStreamRequest(
  path: string,
  body: any,
  onChunk: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = `${API_BASE}${path}`;
  const token = getAccessToken();
  const requestBody = JSON.stringify(body);

  const requestStream = () => {
    const currentToken = getAccessToken();
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { 'Authorization': `Bearer ${currentToken}` } : {}),
      },
      body: requestBody,
      signal,
    });
  };

  let res = await requestStream();

  if (res.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await requestStream();
    }
  }

  if (!res.ok) {
    const errorText = await res.text().catch(() => '未知错误');
    throw new Error(`AI 服务错误: ${errorText}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let inReasoning = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          if (inReasoning) onChunk('</think>\n\n');
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          if (delta) {
            if (delta.reasoning_content) {
              if (!inReasoning) {
                inReasoning = true;
                onChunk('<think>\n');
              }
              onChunk(delta.reasoning_content);
            }
            if (delta.content) {
              if (inReasoning) {
                inReasoning = false;
                onChunk('\n</think>\n\n');
              }
              onChunk(delta.content);
            }
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }
}

/**
 * 文件上传
 */
export async function uploadImages(files: File[]): Promise<string[]> {
  const formData = new FormData();
  files.forEach(f => formData.append('images', f));

  const result = await apiRequest<{ urls: string[] }>('/upload/images', {
    method: 'POST',
    body: formData,
  });
  return result.urls;
}

export async function uploadFont(file: File): Promise<{ url: string; fileName: string; fileSize: number }> {
  const formData = new FormData();
  formData.append('font', file);

  return apiRequest('/upload/fonts', {
    method: 'POST',
    body: formData,
  });
}

// === 便捷方法 ===

export const api = {
  get: <T = any>(path: string) => apiRequest<T>(path),
  post: <T = any>(path: string, body?: any) => apiRequest<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  }),
  put: <T = any>(path: string, body?: any) => apiRequest<T>(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  }),
  delete: <T = any>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};

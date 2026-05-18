/**
 * JWT 认证中间件
 */
import '../lib/env.js';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';

function getJwtSecret(name: string, fallback?: string): Secret {
  const value = process.env[name] || fallback;
  if (process.env.NODE_ENV === 'production' && (!value || value.length < 32)) {
    throw new Error(`${name} must be set to at least 32 characters in production`);
  }
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

const JWT_SECRET = getJwtSecret('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'xiaoxiang-dev-jwt-secret-change-me');

export interface AuthPayload {
  userId: string;
  email: string;
  nickname: string;
}

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/**
 * 必须认证中间件 - 未认证的请求返回 401
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: '未登录，请先登录' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token 已失效，请重新登录' });
    return;
  }
}

/**
 * 可选认证中间件 - 有 Token 就解析，没有也放行
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    } catch {
      // Token 无效就忽略
    }
  }
  next();
}

/**
 * 生成 JWT Token
 */
export function generateTokens(payload: AuthPayload) {
  const accessOptions: SignOptions = {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'],
  };
  const refreshOptions: SignOptions = {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as SignOptions['expiresIn'],
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, {
    ...accessOptions,
  });

  const refreshSecret = getJwtSecret('JWT_REFRESH_SECRET', JWT_SECRET.toString());
  const refreshToken = jwt.sign(payload, refreshSecret, refreshOptions);

  return { accessToken, refreshToken };
}

/**
 * 验证 Refresh Token
 */
export function verifyRefreshToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, getJwtSecret('JWT_REFRESH_SECRET', JWT_SECRET.toString())) as AuthPayload;
  } catch {
    return null;
  }
}

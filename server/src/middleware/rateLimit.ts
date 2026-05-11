import type { NextFunction, Request, Response } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
  keyGenerator?: (req: Request) => string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function clientIp(req: Request) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function userOrIpKey(req: Request) {
  return req.user?.userId || clientIp(req);
}

export function emailIpKey(req: Request) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${clientIp(req)}:${email || 'no-email'}`;
}

export function rateLimit(options: RateLimitOptions) {
  const message = options.message || '请求太频繁，请稍后再试';

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const rawKey = options.keyGenerator ? options.keyGenerator(req) : clientIp(req);
    const key = `${options.keyPrefix}:${rawKey}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000));
      res.status(429).json({ error: message });
      return;
    }

    current.count += 1;
    next();

    if (buckets.size > 5000) {
      for (const [bucketKey, bucket] of buckets.entries()) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey);
      }
    }
  };
}

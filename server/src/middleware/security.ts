import type { NextFunction, Request, Response } from 'express';

const DEFAULT_APP_ORIGINS = [
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
  'ionic://localhost',
];

function configuredOrigins() {
  const origins = [
    ...DEFAULT_APP_ORIGINS,
    process.env.APP_URL,
    process.env.FRONTEND_URL,
    ...(process.env.APP_ORIGINS || '').split(','),
  ];

  return new Set(
    origins
      .filter((origin): origin is string => !!origin)
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

export function corsOrigin(origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
  if (!origin) {
    callback(null, true);
    return;
  }

  const normalized = origin.replace(/\/$/, '');
  const allowDevLocalhost = process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalized);

  callback(null, allowDevLocalhost || configuredOrigins().has(normalized));
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

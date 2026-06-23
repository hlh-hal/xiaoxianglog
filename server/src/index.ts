/**
 * 闁诲繐绻愮换妤呮寘閸曨垰绫嶉柕澶堝劤缁犲爼鏌涘顒佹崳妞?- Express 闁圭厧鐡ㄥ濠氬极閵堝绀傞柕澶堝劚缂?
 */
import './lib/env.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import authRoutes from './routes/auth.js';
import diaryRoutes from './routes/diary.js';
import templateRoutes from './routes/templates.js';
import historyRoutes from './routes/history.js';
import chatRoutes from './routes/chat.js';
import communityRoutes from './routes/community.js';
import friendRoutes from './routes/friends.js';
import notificationRoutes from './routes/notifications.js';
import leaderboardRoutes from './routes/leaderboard.js';
import monthlyEchoRoutes from './routes/monthlyEcho.js';
import uploadRoutes from './routes/upload.js';
import syncRoutes from './routes/sync.js';
import { configureSqlite } from './lib/prisma.js';
import { startDailyReminderScheduler } from './lib/dailyReminderScheduler.js';
import { startMonthlyEchoScheduler } from './lib/monthlyEchoScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[process] uncaughtException:', error);
});

function getPort() {
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return 3001;
  }
  return port;
}

const PORT = getPort();
const BODY_LIMIT_BYTES = 50 * 1024 * 1024;
const SERVER_BUILD_ID = 'cpamc-only-20260520';

await configureSqlite();

function parseRequestBody(req: express.Request, res: express.Response, next: express.NextFunction) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    next();
    return;
  }

  const contentType = req.headers['content-type'] || '';
  const isJson = contentType.includes('application/json');
  const isUrlEncoded = contentType.includes('application/x-www-form-urlencoded');

  if (!isJson && !isUrlEncoded) {
    next();
    return;
  }

  let size = 0;
  const chunks: Buffer[] = [];

  req.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) {
      res.status(413).json({ error: 'Request body too large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      req.body = {};
      next();
      return;
    }

    try {
      req.body = isJson
        ? JSON.parse(raw)
        : Object.fromEntries(new URLSearchParams(raw));
      next();
    } catch {
      res.status(400).json({ error: 'Invalid request body' });
    }
  });

  req.on('error', () => {
    res.status(400).json({ error: 'Failed to read request body' });
  });
}

// === 婵炴垶鎼╅崣鍐ㄎ涢幐搴ｎ浄?===
app.use(cors({
  origin: true, // 闂佺绻嬪ù鍥敊韫囨稑绠ラ柍褜鍓熷鍨緞鐎ｎ偊妾峰┑鐘欏嫬濮х紒杈ㄢ攪VP 闂傚倸鍟抽崺鏍敊瀹€鍕櫖?  credentials: true,
}));
app.use(parseRequestBody);

// Static files for uploaded images and fonts
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const uploadStaticOptions: NonNullable<Parameters<typeof express.static>[1]> = {
  immutable: true,
  maxAge: '1y',
};
app.use('/uploads', express.static(path.resolve(uploadDir), uploadStaticOptions));
app.use('/api/uploads', express.static(path.resolve(uploadDir), uploadStaticOptions));

// === API 闁荤姳璀﹂崹鎶藉极?===
function mountRoutes(prefix = '') {
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/diary`, diaryRoutes);
  app.use(`${prefix}/templates`, templateRoutes);
  app.use(`${prefix}/history`, historyRoutes);
  app.use(`${prefix}/chat`, chatRoutes);
  app.use(`${prefix}/community`, communityRoutes);
  app.use(`${prefix}/friends`, friendRoutes);
  app.use(`${prefix}/notifications`, notificationRoutes);
  app.use(`${prefix}/leaderboard`, leaderboardRoutes);
  app.use(`${prefix}/monthly-echo`, monthlyEchoRoutes);
  app.use(`${prefix}/upload`, uploadRoutes);
  app.use(`${prefix}/sync`, syncRoutes);
}

mountRoutes('/api');
mountRoutes();
console.log(`[startup] cpamcBaseUrl=${process.env.CPAMC_BASE_URL || '(not configured)'}`);
console.log(`[startup] xiaomiBaseUrl=${process.env.XIAOMI_BASE_URL || '(not configured)'}`);
console.log(`[startup] build=${SERVER_BUILD_ID} pid=${process.pid}`);

// === 闂佺顑冮崕閬嶅箖瀹ュ憘娑㈠焵椤掑嫬钃?===
app.get(['/api/health', '/health'], (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    build: SERVER_BUILD_ID,
    pid: process.pid,
  });
});

// === 闂佺绻堥崝宀勬儑椤掑嫭鐓ユ繛鍡樺俯閸ゆ牕顭跨捄鍝勵伀闁?===
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('闂佸搫鐗嗙粔瀛樻叏閻旂厧闂柕濞炬櫆閺呪晠鎮?', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
});

// === 闂佸憡鍑归崹鐗堟叏閳哄懎瀚夌€广儱鎳庨～銈夋煕?===
app.listen(PORT, '0.0.0.0', () => {
  console.log(`濡絽鍟崑?闁诲繐绻愮换妤呮寘閸曨垰绫嶉柕澶堝劤缁犲爼鏌涘顒佹崳妞ゅ浚鍓欓蹇涘箵閹烘挸鍓婚梺? http://localhost:${PORT}`);
  console.log(`濡絽鍟幉?闂佽桨鑳舵晶妤€鐣垫担瑙勫劅? ${process.env.DATABASE_URL}`);
  startDailyReminderScheduler();
  startMonthlyEchoScheduler();
});

export default app;

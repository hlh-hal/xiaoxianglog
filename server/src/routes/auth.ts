/**
 * 用户认证路由
 * POST /api/auth/register - 注册
 * POST /api/auth/login - 登录
 * POST /api/auth/refresh - 刷新 Token
 * GET  /api/auth/me - 获取当前用户信息
 * PUT  /api/auth/me - 更新个人信息
 * POST /api/auth/forgot-password - 重置密码
 */
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../lib/prisma.js';
import { deleteStoredUrls } from '../lib/objectStorage.js';
import { requireAuth, generateTokens, verifyRefreshToken, AuthPayload } from '../middleware/auth.js';
import { emailIpKey, rateLimit, userOrIpKey } from '../middleware/rateLimit.js';

const router = Router();
type VerifyType = 'register' | 'reset';

const authWriteLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  keyPrefix: 'auth-write',
  keyGenerator: emailIpKey,
  message: '请求太频繁，请 15 分钟后再试',
});

const emailCodeLimit = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  keyPrefix: 'email-code',
  keyGenerator: emailIpKey,
  message: '验证码发送太频繁，请稍后再试',
});

const accountDeleteLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyPrefix: 'account-delete',
  keyGenerator: userOrIpKey,
});

type CodeRecord = {
  email: string;
  type: VerifyType;
  codeHash: string;
  expiresAt: number;
  attempts: number;
};

type TokenRecord = {
  email: string;
  type: VerifyType;
  expiresAt: number;
};

const emailCodes = new Map<string, CodeRecord>();
const verificationTokens = new Map<string, TokenRecord>();
const CODE_TTL_MS = 5 * 60 * 1000;
const TOKEN_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function codeKey(email: string, type: VerifyType) {
  return `${type}:${normalizeEmail(email)}`;
}

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function cleanupExpiredVerificationData() {
  const now = Date.now();
  for (const [key, record] of emailCodes.entries()) {
    if (record.expiresAt <= now) emailCodes.delete(key);
  }
  for (const [key, record] of verificationTokens.entries()) {
    if (record.expiresAt <= now) verificationTokens.delete(key);
  }
}

function consumeVerificationToken(token: string, email: string, type: VerifyType) {
  cleanupExpiredVerificationData();
  const record = verificationTokens.get(token);
  if (!record) return false;
  const matches = record.email === normalizeEmail(email) && record.type === type && record.expiresAt > Date.now();
  if (matches) {
    verificationTokens.delete(token);
  }
  return matches;
}

function getMailTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user, pass },
  });
}

function parseJsonStringArray(value?: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function parseDailyEchoImageUrls(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    const imageUrl = parsed?.card?.imageUrl;
    return typeof imageUrl === 'string' && imageUrl.trim() ? [imageUrl] : [];
  } catch {
    return [];
  }
}

function getUploadPathFromUrl(url?: string | null) {
  if (!url || /^https?:\/\//i.test(url) || url.startsWith('data:')) return null;

  const normalized = url.replace(/\\/g, '/');
  const uploadsIndex = normalized.indexOf('/uploads/');
  if (uploadsIndex < 0) return null;

  const relativePath = decodeURIComponent(normalized.slice(uploadsIndex + '/uploads/'.length));
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const absolutePath = path.resolve(uploadRoot, relativePath);

  if (!absolutePath.startsWith(uploadRoot + path.sep) && absolutePath !== uploadRoot) {
    return null;
  }

  return absolutePath;
}

async function deleteUploadedFiles(urls: string[]) {
  const paths = Array.from(new Set(urls.map(getUploadPathFromUrl).filter((item): item is string => !!item)));
  await Promise.all(paths.map(async (filePath) => {
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.warn('删除上传文件失败:', filePath, err);
      }
    }
  }));
}

async function sendVerificationEmail(email: string, code: string, type: VerifyType) {
  const transporter = getMailTransporter();
  const devReturnCode = process.env.MAIL_DEV_RETURN_CODE === 'true';
  if (!transporter) {
    if (devReturnCode) return { delivered: false, devCode: code };
    throw new Error('邮件服务未配置，请先配置 SMTP_HOST、SMTP_USER、SMTP_PASS');
  }

  const subject = type === 'register' ? '小象日志注册验证码' : '小象日志重置密码验证码';
  const action = type === 'register' ? '注册小象日志账号' : '重置小象日志密码';
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject,
    text: `你的验证码是：${code}。该验证码 5 分钟内有效，请勿泄露给他人。`,
    html: `<div style="font-family: sans-serif; line-height: 1.7; color: #1c1c1e;">
      <h2>${subject}</h2>
      <p>你正在${action}，验证码为：</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
      <p>该验证码 5 分钟内有效，请勿泄露给他人。</p>
    </div>`,
  });
  return { delivered: true, devCode: devReturnCode ? code : undefined };
}

// 发送邮箱验证码
router.post('/send-code', emailCodeLimit, async (req: Request, res: Response) => {
  try {
    cleanupExpiredVerificationData();
    const email = normalizeEmail(req.body.email);
    const type = req.body.type as VerifyType;
    if (!isValidEmail(email) || !['register', 'reset'].includes(type)) {
      res.status(400).json({ error: '邮箱或验证码类型不正确' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (type === 'register' && existing) {
      res.status(409).json({ error: '该邮箱已被注册' });
      return;
    }
    if (type === 'reset' && !existing) {
      res.status(404).json({ error: '未找到该邮箱对应的账号' });
      return;
    }

    const key = codeKey(email, type);
    const current = emailCodes.get(key);
    if (current && current.expiresAt - Date.now() > CODE_TTL_MS - 60 * 1000) {
      res.status(429).json({ error: '验证码发送太频繁，请稍后再试' });
      return;
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    emailCodes.set(key, {
      email,
      type,
      codeHash: hashCode(code),
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    });

    const result = await sendVerificationEmail(email, code, type);
    res.json({ message: result.delivered ? '验证码已发送' : '开发环境验证码已生成', devCode: result.devCode });
  } catch (err: any) {
    console.error('发送验证码失败:', err);
    res.status(500).json({ error: err.message || '发送验证码失败' });
  }
});

// 校验邮箱验证码
router.post('/verify-code', authWriteLimit, async (req: Request, res: Response) => {
  try {
    cleanupExpiredVerificationData();
    const email = normalizeEmail(req.body.email);
    const type = req.body.type as VerifyType;
    const code = String(req.body.code || '').trim();
    if (!isValidEmail(email) || !['register', 'reset'].includes(type) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: '验证码信息不正确' });
      return;
    }

    const key = codeKey(email, type);
    const record = emailCodes.get(key);
    if (!record || record.expiresAt <= Date.now()) {
      emailCodes.delete(key);
      res.status(400).json({ error: '验证码已过期或不存在' });
      return;
    }

    if (record.attempts >= 5) {
      emailCodes.delete(key);
      res.status(429).json({ error: '验证码错误次数过多，请重新获取' });
      return;
    }

    if (record.codeHash !== hashCode(code)) {
      record.attempts += 1;
      res.status(400).json({ error: '验证码错误' });
      return;
    }

    emailCodes.delete(key);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    verificationTokens.set(verificationToken, {
      email,
      type,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    res.json({ verificationToken });
  } catch (err: any) {
    console.error('校验验证码失败:', err);
    res.status(500).json({ error: '验证码校验失败' });
  }
});

// 注册
router.post('/register', authWriteLimit, async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { nickname, password, verificationToken } = req.body;
    if (!email || !nickname || !password) {
      res.status(400).json({ error: '请填写完整信息' });
      return;
    }
    if (!consumeVerificationToken(verificationToken, email, 'register')) {
      res.status(400).json({ error: '请先完成邮箱验证码验证' });
      return;
    }

    // 检查邮箱是否已注册
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: '该邮箱已被注册' });
      return;
    }

    // 密码加密
    const passwordHash = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await prisma.user.create({
      data: { email, nickname, passwordHash },
    });

    // 生成 Token
    const payload: AuthPayload = { userId: user.id, email: user.email, nickname: user.nickname };
    const tokens = generateTokens(payload);

    res.status(201).json({
      user: { id: user.id, email: user.email, nickname: user.nickname, avatarUrl: user.avatarUrl, bio: user.bio },
      ...tokens,
    });
  } catch (err: any) {
    console.error('注册失败:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录
router.post('/login', authWriteLimit, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: '请输入邮箱和密码' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: '邮箱或密码错误' });
      return;
    }

    const payload: AuthPayload = { userId: user.id, email: user.email, nickname: user.nickname };
    const tokens = generateTokens(payload);

    res.json({
      user: { id: user.id, email: user.email, nickname: user.nickname, avatarUrl: user.avatarUrl, bio: user.bio },
      ...tokens,
    });
  } catch (err: any) {
    console.error('登录失败:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// 刷新 Token
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: '缺少 refreshToken' });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      res.status(401).json({ error: 'Refresh Token 已失效' });
      return;
    }

    // 重新查询用户信息（保证最新）
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) {
      res.status(401).json({ error: '用户不存在' });
      return;
    }

    const newPayload: AuthPayload = { userId: user.id, email: user.email, nickname: user.nickname };
    const tokens = generateTokens(newPayload);
    res.json(tokens);
  } catch (err: any) {
    console.error('刷新 Token 失败:', err);
    res.status(500).json({ error: '刷新失败' });
  }
});

// 获取当前用户信息
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, nickname: true, avatarUrl: true, bio: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    res.json(user);
  } catch (err: any) {
    console.error('获取用户信息失败:', err);
    res.status(500).json({ error: '获取失败' });
  }
});

// 更新个人信息
router.put('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const { nickname, bio, avatarUrl } = req.body;
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(nickname !== undefined && { nickname }),
        ...(bio !== undefined && { bio }),
        ...(avatarUrl !== undefined && { avatarUrl }),
      },
      select: { id: true, email: true, nickname: true, avatarUrl: true, bio: true },
    });
    res.json(user);
  } catch (err: any) {
    console.error('更新用户信息失败:', err);
    res.status(500).json({ error: '更新失败' });
  }
});

// 重置密码（简化版：直接通过邮箱 + 新密码重置）
router.post('/forgot-password', authWriteLimit, async (req: Request, res: Response) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { newPassword, verificationToken } = req.body;
    if (!email || !newPassword) {
      res.status(400).json({ error: '请填写完整信息' });
      return;
    }
    if (!consumeVerificationToken(verificationToken, email, 'reset')) {
      res.status(400).json({ error: '请先完成邮箱验证码验证' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(404).json({ error: '未找到该邮箱对应的账号' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: { passwordHash },
    });

    res.json({ message: '密码重置成功' });
  } catch (err: any) {
    console.error('重置密码失败:', err);
    res.status(500).json({ error: '重置失败' });
  }
});

// 注销账号
router.delete('/me', requireAuth, accountDeleteLimit, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    const [user, entries, posts, editHistories, customFonts] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      }),
      prisma.diaryEntry.findMany({
        where: { userId },
        select: { id: true, images: true, dailyEcho: true },
      }),
      prisma.communityPost.findMany({
        where: { userId },
        select: { id: true, images: true },
      }),
      prisma.editHistory.findMany({
        where: { userId },
        select: { images: true },
      }),
      prisma.customFont.findMany({
        where: { userId },
        select: { fileUrl: true },
      }),
    ]);

    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const entryIds = entries.map(entry => entry.id);
    const postIds = posts.map(post => post.id);
    const uploadUrls = [
      user.avatarUrl,
      ...entries.flatMap(entry => parseJsonStringArray(entry.images)),
      ...entries.flatMap(entry => parseDailyEchoImageUrls(entry.dailyEcho)),
      ...posts.flatMap(post => parseJsonStringArray(post.images)),
      ...editHistories.flatMap(history => parseJsonStringArray(history.images)),
      ...customFonts.map(font => font.fileUrl),
    ].filter((item): item is string => !!item);

    const deleted = await prisma.$transaction(async (tx) => {
      const notifications = await tx.notification.deleteMany({
        where: {
          OR: [
            { userId },
            { fromUserId: userId },
            ...(postIds.length > 0 ? [{ refPostId: { in: postIds } }] : []),
            ...(entryIds.length > 0 ? [{ refDiaryId: { in: entryIds } }] : []),
          ],
        },
      });
      const friendships = await tx.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: userId },
            { addresseeId: userId },
          ],
        },
      });
      const leaderboardLikes = await tx.leaderboardLike.deleteMany({
        where: {
          OR: [
            { userId },
            { fromUserId: userId },
          ],
        },
      });
      const postLikes = await tx.postLike.deleteMany({
        where: {
          OR: [
            { userId },
            ...(postIds.length > 0 ? [{ postId: { in: postIds } }] : []),
          ],
        },
      });
      const postComments = await tx.postComment.deleteMany({
        where: {
          OR: [
            { userId },
            ...(postIds.length > 0 ? [{ postId: { in: postIds } }] : []),
          ],
        },
      });
      const communityPosts = await tx.communityPost.deleteMany({ where: { userId } });
      const editHistories = await tx.editHistory.deleteMany({
        where: {
          OR: [
            { userId },
            ...(entryIds.length > 0 ? [{ entryId: { in: entryIds } }] : []),
          ],
        },
      });
      const chatSessions = await tx.chatSession.deleteMany({ where: { userId } });
      const customFonts = await tx.customFont.deleteMany({ where: { userId } });
      const templates = await tx.diaryTemplate.deleteMany({ where: { userId, isSystem: false } });
      const diaryEntries = await tx.diaryEntry.deleteMany({ where: { userId } });

      await tx.user.delete({ where: { id: userId } });

      return {
        notifications: notifications.count,
        friendships: friendships.count,
        leaderboardLikes: leaderboardLikes.count,
        postLikes: postLikes.count,
        postComments: postComments.count,
        communityPosts: communityPosts.count,
        editHistories: editHistories.count,
        chatSessions: chatSessions.count,
        customFonts: customFonts.count,
        templates: templates.count,
        diaryEntries: diaryEntries.count,
      };
    });

    await deleteStoredUrls(uploadUrls);
    res.json({ message: '账号已注销，用户数据已删除', deleted });
  } catch (err: any) {
    console.error('注销账号失败:', err);
    res.status(500).json({ error: '注销失败' });
  }
});

export default router;

/**
 * 通知路由
 */
import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import { paramString, queryString } from '../utils/request.js';
import {
  getOrCreateNotificationPreference,
  getRandomDailyReminderBody,
  getVapidPublicKey,
  isWebPushConfigured,
  sendPushToUser,
} from '../lib/push.js';
import { cancelPendingMonthlyEchoJobs } from '../lib/monthlyEchoService.js';
import { normalizePushTime, safeTimeZone } from '../lib/monthlyEchoUtils.js';

const router = Router();
router.use(requireAuth);

// 获取通知列表
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const type = queryString(req, 'type'); // 'friend_request' | 'like,comment,poke'

    const where: any = { userId };
    if (type) {
      const types = type.split(',');
      where.type = { in: types };
    }

    const notifications = await prisma.notification.findMany({
      where,
      include: {
        sender: { select: { id: true, nickname: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const friendRequestSenderIds = Array.from(new Set(
      notifications
        .filter(n => n.type === 'friend_request' && n.fromUserId)
        .map(n => n.fromUserId as string),
    ));
    const friendships = friendRequestSenderIds.length
      ? await prisma.friendship.findMany({
          where: {
            OR: [
              { requesterId: { in: friendRequestSenderIds }, addresseeId: userId },
              { requesterId: userId, addresseeId: { in: friendRequestSenderIds } },
            ],
          },
        })
      : [];
    const friendStatusMap = new Map<string, string>();
    friendships.forEach(friendship => {
      const otherId = friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId;
      friendStatusMap.set(otherId, friendship.status);
    });

    res.json(notifications.map(n => ({
      id: n.id,
      type: n.type,
      fromUser: n.sender ? {
        id: n.sender.id,
        name: n.sender.nickname,
        avatar: n.sender.avatarUrl,
      } : null,
      content: n.content,
      refPostId: n.refPostId,
      refDiaryId: n.refDiaryId,
      isRead: n.isRead,
      friendStatus: n.fromUserId ? friendStatusMap.get(n.fromUserId) || 'none' : 'none',
      createdAt: n.createdAt.toISOString(),
    })));
  } catch (err: any) {
    res.status(500).json({ error: '获取通知失败' });
  }
});

// 标记全部已读
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: '已全部标记为已读' });
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' });
  }
});

router.get('/push/public-key', (_req: Request, res: Response) => {
  res.json({
    publicKey: getVapidPublicKey(),
    configured: isWebPushConfigured(),
  });
});

router.get('/push/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const [subscriptionCount, preference] = await Promise.all([
      prisma.pushSubscription.count({ where: { userId } }),
      getOrCreateNotificationPreference(userId),
    ]);

    res.json({
      configured: isWebPushConfigured(),
      subscriptionCount,
      preference,
    });
  } catch (err: any) {
    console.error('获取推送状态失败:', err);
    res.status(500).json({ error: '获取推送状态失败' });
  }
});

router.post('/push/self-test', async (req: Request, res: Response) => {
  try {
    const sentCount = await sendPushToUser(req.user!.userId, {
      title: '小象日志',
      body: getRandomDailyReminderBody(),
      tag: `xiang-server-push-test-${Date.now()}`,
      url: '/editor',
      type: 'server_push_test',
    });

    res.json({
      message: sentCount > 0 ? '服务器推送已发送' : '没有可用的 PWA 推送订阅',
      sentCount,
      configured: isWebPushConfigured(),
    });
  } catch (err: any) {
    console.error('服务器推送自检失败:', err);
    res.status(500).json({ error: '服务器推送自检失败' });
  }
});

router.post('/push/subscribe', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const subscription = req.body.subscription || req.body;
    const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint : '';
    const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh : '';
    const auth = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth : '';

    if (!endpoint || !p256dh || !auth) {
      res.status(400).json({ error: '订阅信息不完整' });
      return;
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh,
        auth,
        userAgent: req.get('user-agent') || null,
      },
      update: {
        userId,
        p256dh,
        auth,
        userAgent: req.get('user-agent') || null,
      },
    });

    res.json({ message: '已保存推送订阅' });
  } catch (err: any) {
    console.error('保存推送订阅失败:', err);
    res.status(500).json({ error: '保存推送订阅失败' });
  }
});

router.delete('/push/subscribe', async (req: Request, res: Response) => {
  try {
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
    if (!endpoint) {
      res.status(400).json({ error: '缺少订阅地址' });
      return;
    }

    await prisma.pushSubscription.deleteMany({
      where: {
        userId: req.user!.userId,
        endpoint,
      },
    });

    res.json({ message: '已删除推送订阅' });
  } catch (err: any) {
    console.error('删除推送订阅失败:', err);
    res.status(500).json({ error: '删除推送订阅失败' });
  }
});

router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const preference = await getOrCreateNotificationPreference(req.user!.userId);
    res.json(preference);
  } catch (err: any) {
    console.error('获取通知偏好失败:', err);
    res.status(500).json({ error: '获取通知偏好失败' });
  }
});

router.put('/preferences', async (req: Request, res: Response) => {
  try {
    const data: any = {};
    const body = req.body || {};
    const userId = req.user!.userId;
    const existingPreference = await prisma.notificationPreference.findUnique({
      where: { userId },
      select: {
        dailyReminderEnabled: true,
        dailyReminderTime: true,
        dailyReminderTimezone: true,
        monthlyEchoEnabled: true,
      },
    });
    let shouldResetDailyReminderDate = false;

    if (typeof body.dailyReminderEnabled === 'boolean') {
      data.dailyReminderEnabled = body.dailyReminderEnabled;
      if (body.dailyReminderEnabled && existingPreference?.dailyReminderEnabled !== true) {
        shouldResetDailyReminderDate = true;
      }
    }

    if (typeof body.dailyReminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.dailyReminderTime)) {
      data.dailyReminderTime = body.dailyReminderTime;
      if (existingPreference?.dailyReminderTime !== body.dailyReminderTime) {
        shouldResetDailyReminderDate = true;
      }
    }

    if (typeof body.dailyReminderTimezone === 'string' && body.dailyReminderTimezone.length <= 80) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: body.dailyReminderTimezone });
        data.dailyReminderTimezone = body.dailyReminderTimezone;
      } catch {
        data.dailyReminderTimezone = 'Asia/Shanghai';
      }
    }

    if (typeof body.monthlyEchoEnabled === 'boolean') {
      data.monthlyEchoEnabled = body.monthlyEchoEnabled;
    }

    if (typeof body.monthlyEchoPushEnabled === 'boolean') {
      data.monthlyEchoPushEnabled = body.monthlyEchoPushEnabled;
    }

    if (typeof body.monthlyEchoPushTime === 'string') {
      data.monthlyEchoPushTime = normalizePushTime(body.monthlyEchoPushTime);
    }

    if (typeof body.monthlyEchoTimezone === 'string' && body.monthlyEchoTimezone.length <= 80) {
      data.monthlyEchoTimezone = safeTimeZone(
        body.monthlyEchoTimezone,
        existingPreference?.dailyReminderTimezone || 'Asia/Shanghai',
      );
    }

    if (typeof body.socialNotifyEnabled === 'boolean') {
      data.socialNotifyEnabled = body.socialNotifyEnabled;
    }

    if (typeof body.friendRequestNotifyEnabled === 'boolean') {
      data.friendRequestNotifyEnabled = body.friendRequestNotifyEnabled;
    }

    if (shouldResetDailyReminderDate) {
      data.lastDailyReminderDate = null;
    }

    const preference = await prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: data,
    });

    if (data.monthlyEchoEnabled === false && existingPreference?.monthlyEchoEnabled !== false) {
      await cancelPendingMonthlyEchoJobs(userId);
    }

    res.json(preference);
  } catch (err: any) {
    console.error('更新通知偏好失败:', err);
    res.status(500).json({ error: '更新通知偏好失败' });
  }
});

// 标记单条已读
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { id: paramString(req, 'id'), userId: req.user!.userId },
      data: { isRead: true },
    });
    res.json({ message: '已标记已读' });
  } catch (err: any) {
    res.status(500).json({ error: '操作失败' });
  }
});

// 获取未读数量
router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.userId, isRead: false },
    });
    res.json({ count });
  } catch (err: any) {
    res.status(500).json({ error: '获取失败' });
  }
});

export default router;

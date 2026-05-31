import webpush from 'web-push';
import prisma from './prisma.js';

export const DAILY_REMINDER_BODIES = [
  '该写点今天的故事了 ✍️',
  '今天，想记录点什么？',
  '留下今天的一句话吧',
  '别让今天悄悄溜走',
  '记录此刻的你',
  '用几分钟，收藏今天',
  '今天的心情，记一下吗？',
  '写给未来的自己',
  '你的今天，值得被记录',
  '打开日记，和自己聊聊吧',
];

type PushPayload = {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  type?: string;
  notificationId?: string;
};

type NotificationForPush = {
  id: string;
  userId: string;
  fromUserId: string | null;
  type: string;
  content: string | null;
  refPostId: string | null;
  sender?: {
    nickname: string;
  } | null;
};

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@xiaoxianglog.cn';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export function isWebPushConfigured(): boolean {
  return Boolean(vapidPublicKey && vapidPrivateKey);
}

export function getVapidPublicKey(): string {
  return vapidPublicKey;
}

export function getRandomDailyReminderBody(): string {
  return DAILY_REMINDER_BODIES[Math.floor(Math.random() * DAILY_REMINDER_BODIES.length)];
}

export async function getOrCreateNotificationPreference(userId: string) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!isWebPushConfigured()) {
    console.warn('[push] VAPID keys are not configured; skip push notification');
    return 0;
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  let sentCount = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        JSON.stringify(payload),
        {
          TTL: 24 * 60 * 60,
          urgency: 'high',
        },
      );
      sentCount += 1;
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || error?.status);
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        return;
      }

      console.warn('[push] failed to send notification:', error?.message || error);
    }
  }));

  return sentCount;
}

function truncateBody(value: string, maxLength = 120): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

export async function sendNotificationPush(notification: NotificationForPush): Promise<void> {
  const preference = await getOrCreateNotificationPreference(notification.userId);
  const senderName = notification.sender?.nickname || '有新动态';

  if (notification.type === 'friend_request') {
    if (!preference.friendRequestNotifyEnabled) return;

    const body = notification.content
      ? `${senderName} 申请添加你为好友：${notification.content}`
      : `${senderName} 申请添加你为好友`;

    await sendPushToUser(notification.userId, {
      title: '新的好友申请',
      body: truncateBody(body),
      tag: `xiang-friend-request-${notification.id}`,
      url: '/inbox',
      type: notification.type,
      notificationId: notification.id,
    });
    return;
  }

  if ((notification.type === 'like' || notification.type === 'comment') && !preference.socialNotifyEnabled) {
    return;
  }

  if (notification.type === 'like') {
    await sendPushToUser(notification.userId, {
      title: '有人点赞了你的日志',
      body: `${senderName} 点赞了你的日志`,
      tag: `xiang-like-${notification.id}`,
      url: notification.refPostId ? `/post/${notification.refPostId}` : '/inbox',
      type: notification.type,
      notificationId: notification.id,
    });
    return;
  }

  if (notification.type === 'comment') {
    const body = notification.content
      ? `${senderName} 评论了你的日志：${notification.content}`
      : `${senderName} 评论了你的日志`;

    await sendPushToUser(notification.userId, {
      title: '有人评论了你的日志',
      body: truncateBody(body),
      tag: `xiang-comment-${notification.id}`,
      url: notification.refPostId ? `/post/${notification.refPostId}` : '/inbox',
      type: notification.type,
      notificationId: notification.id,
    });
  }
}

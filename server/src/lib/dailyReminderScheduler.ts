import prisma from './prisma.js';
import { getRandomDailyReminderBody, sendPushToUser } from './push.js';

const CHECK_INTERVAL_MS = 60 * 1000;
const DEFAULT_TIMEZONE = 'Asia/Shanghai';

let schedulerStarted = false;

function getZonedNow(timeZone: string) {
  const safeTimeZone = timeZone || DEFAULT_TIMEZONE;

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date());

    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
      date: `${byType.year}-${byType.month}-${byType.day}`,
      minutes: Number(byType.hour) * 60 + Number(byType.minute),
    };
  } catch {
    return getZonedNow(DEFAULT_TIMEZONE);
  }
}

function parseReminderMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

export async function runDailyReminderCheck(): Promise<number> {
  const preferences = await prisma.notificationPreference.findMany({
    where: {
      dailyReminderEnabled: true,
      user: {
        pushSubscriptions: {
          some: {},
        },
      },
    },
    select: {
      id: true,
      userId: true,
      dailyReminderTime: true,
      dailyReminderTimezone: true,
      lastDailyReminderDate: true,
    },
  });

  let sentUsers = 0;

  for (const preference of preferences) {
    const reminderMinutes = parseReminderMinutes(preference.dailyReminderTime);
    if (reminderMinutes === null) continue;

    const now = getZonedNow(preference.dailyReminderTimezone);
    if (preference.lastDailyReminderDate === now.date) continue;
    if (now.minutes < reminderMinutes) continue;

    const sentCount = await sendPushToUser(preference.userId, {
      title: '小象日志',
      body: getRandomDailyReminderBody(),
      tag: `xiang-daily-reminder-${now.date}-${preference.dailyReminderTime}`,
      url: '/editor',
      type: 'daily_reminder',
    });

    if (sentCount > 0) {
      await prisma.notificationPreference.update({
        where: { id: preference.id },
        data: { lastDailyReminderDate: now.date },
      });
      sentUsers += 1;
    }
  }

  return sentUsers;
}

export function startDailyReminderScheduler(): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const run = () => {
    runDailyReminderCheck().catch((error) => {
      console.warn('[daily-reminder] check failed:', error?.message || error);
    });
  };

  run();
  setInterval(run, CHECK_INTERVAL_MS);
}

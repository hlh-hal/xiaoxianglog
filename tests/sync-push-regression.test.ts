import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import prisma, { configureSqlite } from '../server/src/lib/prisma.js';
import { generateTokens } from '../server/src/middleware/auth.js';
import syncRoutes from '../server/src/routes/sync.js';

const userId = `sync-test-user-${Date.now()}`;
const email = `${userId}@example.invalid`;
const entryId = `sync-test-entry-${Date.now()}`;

type JsonResponse = {
  status: number;
  body: any;
};

async function requestJson(url: string, token: string, body: unknown): Promise<JsonResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}

async function main() {
  await configureSqlite();
  await prisma.user.create({
    data: {
      id: userId,
      email,
      nickname: 'sync regression',
      passwordHash: 'not-used',
    },
  });

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  (app as any).use('/sync', syncRoutes);
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  const baseUrl = `http://127.0.0.1:${address.port}/sync/push`;
  const { accessToken } = generateTokens({ userId, email, nickname: 'sync regression' });
  const payload = {
    entries: [
      {
        id: entryId,
        title: 'sync regression',
        content: '2026-06-04 sync regression',
        diaryDate: '2026-06-04T09:30:00.000Z',
        status: 'active',
        images: [],
        tags: ['sync'],
        activeWritingSeconds: 14 * 60,
        updatedAt: '2026-06-04T09:30:00.000Z',
      },
    ],
  };

  try {
    const [first, second] = await Promise.all([
      requestJson(baseUrl, accessToken, payload),
      requestJson(baseUrl, accessToken, payload),
    ]);

    assert.notEqual(first.status, 500, 'first concurrent push must not 500');
    assert.notEqual(second.status, 500, 'second concurrent push must not 500');
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);

    const stored = await prisma.diaryEntry.findUnique({ where: { id: entryId } });
    assert.ok(stored);
    assert.equal(stored.userId, userId);
    assert.equal(stored.diaryDate, '2026-06-04');
    assert.equal(stored.status, 'active');
    assert.equal(stored.activeWritingSeconds, 14 * 60);

    const lowerDurationUpdate = await requestJson(baseUrl, accessToken, {
      entries: [
        {
          id: entryId,
          title: 'sync regression lower duration',
          content: 'lower activeWritingSeconds must not overwrite stored duration',
          diaryDate: '2026-06-04',
          status: 'active',
          images: [],
          tags: ['sync'],
          activeWritingSeconds: 60,
          updatedAt: '2026-06-04T10:00:00.000Z',
        },
      ],
    });
    assert.equal(lowerDurationUpdate.status, 200);
    assert.equal(lowerDurationUpdate.body.results[0].status, 'updated');
    const afterLowerDuration = await prisma.diaryEntry.findUnique({ where: { id: entryId } });
    assert.ok(afterLowerDuration);
    assert.equal(afterLowerDuration.activeWritingSeconds, 14 * 60);

    const higherDurationUpdate = await requestJson(baseUrl, accessToken, {
      entries: [
        {
          id: entryId,
          title: 'sync regression higher duration',
          content: 'higher activeWritingSeconds should be stored',
          diaryDate: '2026-06-04',
          status: 'active',
          images: [],
          tags: ['sync'],
          activeWritingSeconds: 15 * 60,
          updatedAt: '2026-06-04T10:10:00.000Z',
        },
      ],
    });
    assert.equal(higherDurationUpdate.status, 200);
    assert.equal(higherDurationUpdate.body.results[0].status, 'updated');
    const afterHigherDuration = await prisma.diaryEntry.findUnique({ where: { id: entryId } });
    assert.ok(afterHigherDuration);
    assert.equal(afterHigherDuration.activeWritingSeconds, 15 * 60);

    const originalUpdate = prisma.diaryEntry.update.bind(prisma.diaryEntry);
    let updateRetrySawDailyEcho = false;
    (prisma.diaryEntry as any).update = async (args: any) => {
      if (args?.data && Object.prototype.hasOwnProperty.call(args.data, 'dailyEcho')) {
        updateRetrySawDailyEcho = true;
        throw new Error('Invalid `prisma.diaryEntry.update()` invocation: Unknown argument `dailyEcho`.');
      }
      return originalUpdate(args);
    };

    try {
      const legacyDailyEchoUpdate = await requestJson(baseUrl, accessToken, {
        entries: [
          {
            id: entryId,
            title: 'sync regression updated',
            content: 'dailyEcho null must not break legacy prisma client',
            diaryDate: '2026-06-04',
            status: 'active',
            images: [],
            tags: ['sync'],
            dailyEcho: null,
            activeWritingSeconds: 1,
            updatedAt: '2026-06-04T10:30:00.000Z',
          },
        ],
      });

      assert.equal(legacyDailyEchoUpdate.status, 200);
      assert.equal(legacyDailyEchoUpdate.body.results[0].status, 'updated');
      assert.equal(updateRetrySawDailyEcho, true);
    } finally {
      (prisma.diaryEntry as any).update = originalUpdate;
    }

    const originalCreate = prisma.diaryEntry.create.bind(prisma.diaryEntry);
    let createRetrySawDailyEcho = false;
    (prisma.diaryEntry as any).create = async (args: any) => {
      if (args?.data && Object.prototype.hasOwnProperty.call(args.data, 'dailyEcho')) {
        createRetrySawDailyEcho = true;
        throw new Error('Invalid `prisma.diaryEntry.create()` invocation: Unknown argument `dailyEcho`.');
      }
      return originalCreate(args);
    };

    try {
      const legacyDailyEchoCreate = await requestJson(baseUrl, accessToken, {
        entries: [
          {
            id: `${entryId}-legacy-daily-echo-create`,
            title: 'legacy daily echo create',
            content: 'dailyEcho null create must not break legacy prisma client',
            diaryDate: '2026-06-05',
            status: 'active',
            images: [],
            tags: ['sync'],
            dailyEcho: null,
            activeWritingSeconds: 90,
            updatedAt: '2026-06-05T10:30:00.000Z',
          },
        ],
      });

      assert.equal(legacyDailyEchoCreate.status, 200);
      assert.equal(legacyDailyEchoCreate.body.results[0].status, 'created');
      assert.equal(createRetrySawDailyEcho, true);
    } finally {
      (prisma.diaryEntry as any).create = originalCreate;
    }

    const invalidImage = await requestJson(baseUrl, accessToken, {
      entries: [
        {
          id: `${entryId}-bad-image`,
          content: 'bad image should not break whole push',
          diaryDate: '2026-06-03',
          status: 'active',
          images: ['data:image/png;base64,abcd'],
        },
        {
          id: `${entryId}-valid-after-bad`,
          content: 'valid entry after bad one',
          diaryDate: '2026-06-03',
          status: 'active',
          images: [],
          activeWritingSeconds: 12,
        },
      ],
    });

    assert.equal(invalidImage.status, 200);
    assert.equal(invalidImage.body.results[0].status, 'created');
    assert.equal(invalidImage.body.results[1].status, 'created');

    const imageFallbackEntry = await prisma.diaryEntry.findUnique({ where: { id: `${entryId}-bad-image` } });
    assert.ok(imageFallbackEntry);
    assert.equal(imageFallbackEntry.diaryDate, '2026-06-03');
    assert.equal(imageFallbackEntry.images, null);

    const validAfterBad = await prisma.diaryEntry.findUnique({ where: { id: `${entryId}-valid-after-bad` } });
    assert.ok(validAfterBad);
    assert.equal(validAfterBad.diaryDate, '2026-06-03');
    assert.equal(validAfterBad.activeWritingSeconds, 12);

    console.log('sync push regression passed');
  } finally {
    await prisma.editHistory.deleteMany({ where: { userId } });
    await prisma.diaryEntry.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

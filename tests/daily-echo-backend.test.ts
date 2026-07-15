import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverDir = path.join(rootDir, 'server');
const databaseFilename = `daily-echo.test-${process.pid}-${Date.now()}.db`;
const databasePath = path.join(serverDir, 'prisma', databaseFilename);
const databaseUrl = `file:./${databaseFilename}`;
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = databaseUrl;

const { default: prisma, configureSqlite } = await import('../server/src/lib/prisma.js');
const {
  enqueueDailyEchoJob,
  getDailyEchoJobSnapshot,
} = await import('../server/src/lib/dailyEchoService.js');

await configureSqlite();
await prisma.$executeRawUnsafe(`
  CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL UNIQUE,
    "nickname" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "avatar_url" TEXT,
    "bio" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
  )
`);
await prisma.$executeRawUnsafe(`
  CREATE TABLE "daily_echo_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "active_key" TEXT,
    "run_key" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "source_entry_updated_at" TEXT NOT NULL,
    "regenerate_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "prompt_input" TEXT,
    "selected_memory_entry_ids" TEXT NOT NULL DEFAULT '[]',
    "preview_content" TEXT NOT NULL DEFAULT '',
    "final_content" TEXT,
    "prompt_version" TEXT NOT NULL DEFAULT 'daily_echo_v1',
    "model" TEXT,
    "provider" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "lock_token" TEXT,
    "locked_until" DATETIME,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" DATETIME,
    "finished_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE
  )
`);
await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "daily_echo_jobs_active_key_key" ON "daily_echo_jobs"("active_key")');
await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "daily_echo_jobs_run_key_key" ON "daily_echo_jobs"("run_key")');
await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "daily_echo_jobs_dedupe_key_key" ON "daily_echo_jobs"("dedupe_key")');

try {
  await prisma.user.createMany({
    data: [
      { id: 'user-a', email: 'a@example.test', nickname: 'A', passwordHash: 'test' },
      { id: 'user-b', email: 'b@example.test', nickname: 'B', passwordHash: 'test' },
    ],
  });

  const baseInput = {
    userId: 'user-a',
    entryId: 'entry-1',
    diaryText: '今天完成了一件重要的事情，也认真记录了自己的感受。',
    diaryDate: '2026-07-11',
    sourceEntryUpdatedAt: '2026-07-11T08:00:00.000Z',
    regenerateCount: 0,
    memoryContext: '只保留与今天相关的一条轻量记忆。',
    selectedMemoryEntryIds: ['memory-1'],
  };

  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () => enqueueDailyEchoJob(baseInput)),
  );
  assert.equal(new Set(concurrent.map(job => job.id)).size, 1);
  assert.equal(await prisma.dailyEchoJob.count(), 1);
  assert.equal((await prisma.dailyEchoJob.findFirst())?.activeKey, 'user-a|entry-1');

  const rapidRegenerate = await enqueueDailyEchoJob({ ...baseInput, regenerateCount: 1 });
  assert.equal(rapidRegenerate.id, concurrent[0].id);
  assert.equal(await prisma.dailyEchoJob.count(), 1);

  const replacement = await enqueueDailyEchoJob({
    ...baseInput,
    diaryText: '今天的日记已经修改，新增了一个完全不同的重要决定。',
    sourceEntryUpdatedAt: '2026-07-11T09:00:00.000Z',
  });
  assert.notEqual(replacement.id, concurrent[0].id);

  const stale = await prisma.dailyEchoJob.findUniqueOrThrow({ where: { id: concurrent[0].id } });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.activeKey, null);
  assert.equal(stale.promptInput, null);
  assert.equal(replacement.status, 'queued');
  assert.equal(await prisma.dailyEchoJob.count({ where: { activeKey: 'user-a|entry-1' } }), 1);

  assert.equal(await getDailyEchoJobSnapshot('user-b', replacement.id), null);
  const publicSnapshot = await getDailyEchoJobSnapshot('user-a', replacement.id);
  assert.equal(publicSnapshot?.id, replacement.id);
  assert.equal(typeof publicSnapshot?.createdAt, 'string');
  assert.equal(publicSnapshot?.content, null);
  assert.equal('finalContent' in (publicSnapshot || {}), false);

  console.log('ok - Daily Echo backend concurrency, stale replacement, privacy cleanup, and user isolation');
} finally {
  await prisma.$disconnect();
  rmSync(databasePath, { force: true });
  rmSync(`${databasePath}-journal`, { force: true });
  rmSync(`${databasePath}-shm`, { force: true });
  rmSync(`${databasePath}-wal`, { force: true });
}

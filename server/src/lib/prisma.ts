/**
 * Shared Prisma client.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export async function configureSqlite() {
  if (!String(process.env.DATABASE_URL || '').startsWith('file:')) return;

  await prisma.$queryRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
  await prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL');
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
}

export default prisma;

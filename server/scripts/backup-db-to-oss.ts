import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OSS from 'ali-oss';
import prisma from '../src/lib/prisma.js';
import { configureSqlite } from '../src/lib/prisma.js';
import { buildOssUrl, isOssEnabled } from '../src/lib/objectStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

function resolveDatabasePath(): string {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must use SQLite for this backup script');
  }

  const rawPath = databaseUrl.slice('file:'.length).replace(/^\/+/, '');
  const preferred = path.resolve(serverRoot, 'prisma', rawPath);
  return preferred;
}

function getBackupKey(stamp: string): string {
  return `backups/sqlite/xiaoxiang-${stamp}.db`;
}

async function locateDatabaseFile(): Promise<string> {
  const preferredDbPath = resolveDatabasePath();
  const fallbackDbPath = path.resolve(serverRoot, process.env.DATABASE_URL!.slice('file:'.length).replace(/^\/+/, ''));

  try {
    await fs.access(preferredDbPath);
    return preferredDbPath;
  } catch {
    await fs.access(fallbackDbPath);
    return fallbackDbPath;
  }
}

async function uploadToOss(tempFile: string, key: string) {
  const buffer = await fs.readFile(tempFile);
  const client = new OSS({
    endpoint: process.env.OSS_ENDPOINT?.trim(),
    accessKeyId: process.env.OSS_ACCESS_KEY_ID?.trim(),
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET?.trim(),
    bucket: process.env.OSS_BUCKET?.trim(),
  });

  await client.put(key, buffer, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });

  console.log(`Backup uploaded to OSS: ${buildOssUrl(key)}`);
}

async function saveLocalBackup(tempFile: string, stamp: string) {
  const backupDir = path.resolve(serverRoot, 'backups', 'sqlite');
  await fs.mkdir(backupDir, { recursive: true });
  const localPath = path.join(backupDir, `xiaoxiang-${stamp}.db`);
  await fs.copyFile(tempFile, localPath);
  console.log(`Backup saved locally: ${localPath}`);
}

async function main() {
  await configureSqlite();

  const dbPath = await locateDatabaseFile();
  const tempDir = path.resolve(serverRoot, 'tmp', 'oss-backups');
  await fs.mkdir(tempDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tempFile = path.join(tempDir, `xiaoxiang-${stamp}.db`);
  const key = getBackupKey(stamp);

  await prisma.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)');
  await fs.copyFile(dbPath, tempFile);

  try {
    if (isOssEnabled()) {
      await uploadToOss(tempFile, key);
    } else {
      await saveLocalBackup(tempFile, stamp);
    }
  } finally {
    await fs.unlink(tempFile).catch(() => undefined);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

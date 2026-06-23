import '../src/lib/env.js';
import prisma, { configureSqlite } from '../src/lib/prisma.js';
import { backfillCurrentMonthMonthlyEcho } from '../src/lib/monthlyEchoService.js';

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  await configureSqlite();
  const limit = Number(readArg('limit') || 50);
  const result = await backfillCurrentMonthMonthlyEcho({
    userId: readArg('userId'),
    monthKey: readArg('monthKey'),
    limit: Number.isFinite(limit) ? limit : 50,
    dryRun: process.argv.includes('--dry-run'),
  });
  console.log(JSON.stringify({ count: result.length, result }, null, 2));
}

main()
  .catch((error) => {
    console.error('[monthly-echo-backfill] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

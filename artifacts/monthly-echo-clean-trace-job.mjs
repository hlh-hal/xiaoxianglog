import '../server/src/lib/env.ts';
import prisma from '../server/src/lib/prisma.ts';
const userId = '10864065-ebd0-4789-8359-acf75fd48a9a';
const monthKey = '2026-06';
const pendingCount = await prisma.dailyTraceNode.count({ where: { userId, monthKey, status: { in: ['pending', 'stale'] } } });
if (pendingCount === 0) {
  await prisma.monthlyEchoJobLog.updateMany({
    where: { userId, monthKey, jobType: 'trace', status: 'pending' },
    data: { status: 'success', finishedAt: new Date(), lastError: null },
  });
}
const result = {
  pendingCount,
  jobs: await prisma.monthlyEchoJobLog.findMany({ where: { userId, monthKey }, orderBy: [{ jobType: 'asc' }], select: { jobType: true, status: true, attemptCount: true, lastError: true } }),
};
console.log(JSON.stringify(result, null, 2));
await prisma.$disconnect();

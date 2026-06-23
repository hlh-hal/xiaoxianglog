import '../server/src/lib/env.ts';
import prisma from '../server/src/lib/prisma.ts';
const userId = '10864065-ebd0-4789-8359-acf75fd48a9a';
const monthKey = '2026-06';
const result = {
  trace: await prisma.dailyTraceNode.groupBy({ by: ['status'], where: { userId, monthKey }, _count: { _all: true } }),
  echo: await prisma.monthlyEcho.findUnique({ where: { userId_monthKey: { userId, monthKey } }, select: { status: true, title: true, pushedAt: true, posterQuote: true, posterThemeLine: true, generatedAt: true } }),
  jobs: await prisma.monthlyEchoJobLog.findMany({ where: { userId, monthKey }, orderBy: [{ jobType: 'asc' }], select: { jobType: true, status: true, attemptCount: true, lockedUntil: true, lastError: true } }),
  jobCount: await prisma.monthlyEchoJobLog.count({ where: { userId, monthKey } }),
};
console.log(JSON.stringify(result, null, 2));
await prisma.$disconnect();

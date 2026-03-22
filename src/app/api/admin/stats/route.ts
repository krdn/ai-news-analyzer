import { NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { crawlQueue } from "@/shared/lib/queue";

export async function GET() {
  // 오늘 시작 시각 (UTC 기준)
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    totalCelebrities,
    totalArticles,
    totalComments,
    totalEvents,
    todayArticles,
    todayComments,
    queueCounts,
  ] = await Promise.all([
    prisma.celebrity.count(),
    prisma.article.count(),
    prisma.comment.count(),
    prisma.event.count(),
    prisma.article.count({ where: { collectedAt: { gte: todayStart } } }),
    prisma.comment.count({
      where: { article: { collectedAt: { gte: todayStart } } },
    }),
    crawlQueue.getJobCounts("waiting", "active", "failed"),
  ]);

  return NextResponse.json({
    totalCelebrities,
    totalArticles,
    totalComments,
    totalEvents,
    todayArticles,
    todayComments,
    queue: {
      waiting: queueCounts.waiting ?? 0,
      active: queueCounts.active ?? 0,
      failed: queueCounts.failed ?? 0,
    },
  });
}

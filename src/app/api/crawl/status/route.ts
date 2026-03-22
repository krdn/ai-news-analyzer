import { NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { crawlQueue } from "@/shared/lib/queue";

export async function GET() {
  try {
    const latestBySource = await prisma.article.groupBy({
      by: ["sourceType"],
      _max: { collectedAt: true },
      _count: true,
    });

    const waiting = await crawlQueue.getWaitingCount();
    const active = await crawlQueue.getActiveCount();
    const failed = await crawlQueue.getFailedCount();
    const repeatableJobs = await crawlQueue.getRepeatableJobs();

    return NextResponse.json({
      sources: latestBySource,
      queue: { waiting, active, failed },
      schedules: repeatableJobs.length,
    });
  } catch (error) {
    console.error("크롤러 상태 조회 오류:", error);
    return NextResponse.json(
      { error: "크롤러 상태 조회에 실패했습니다" },
      { status: 500 }
    );
  }
}

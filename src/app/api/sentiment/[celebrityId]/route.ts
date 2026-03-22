import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { getCached, getCacheKey } from "@/shared/lib/cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ celebrityId: string }> }
) {
  const { celebrityId } = await params;
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "HOURLY";
  const days = parseInt(searchParams.get("days") ?? "30");

  const cacheKey = getCacheKey("celeb", celebrityId, "sentiment", period, String(days));

  const result = await getCached(cacheKey, 120, async () => {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snapshots = await prisma.sentimentSnapshot.findMany({
      where: {
        celebrityId,
        periodType: period as "HOURLY" | "DAILY" | "WEEKLY",
        periodStart: { gte: since },
      },
      orderBy: { periodStart: "asc" },
    });

    const recentComments = await prisma.comment.findMany({
      where: {
        article: { celebrityId },
        sentimentLabel: { not: null },
      },
      orderBy: { publishedAt: "desc" },
      take: 20,
      include: {
        article: {
          select: { title: true, sourceUrl: true, sourceType: true },
        },
      },
    });

    return { snapshots, recentComments };
  });

  return NextResponse.json(result);
}

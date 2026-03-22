import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { getCached, getCacheKey } from "@/shared/lib/cache";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const celebrityId = searchParams.get("celebrityId");
  const days = parseInt(searchParams.get("days") || "30", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const cursor = searchParams.get("cursor");

  const cacheKey = getCacheKey(
    "events",
    celebrityId ?? "all",
    String(days),
    String(limit),
    cursor ?? "start",
  );

  const result = await getCached(cacheKey, 300, async () => {
    const where: Record<string, unknown> = {};

    if (celebrityId) {
      where.celebrityId = celebrityId;
    }

    // 지정된 기간 내 이벤트만 조회
    const since = new Date();
    since.setDate(since.getDate() - days);
    where.eventDate = { gte: since };

    const events = await prisma.event.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { eventDate: "desc" },
      select: {
        id: true,
        celebrityId: true,
        title: true,
        eventDate: true,
        detectedAt: true,
        sentimentBefore: true,
        sentimentAfter: true,
        impactScore: true,
        autoDetected: true,
        celebrity: {
          select: { name: true, category: true },
        },
      },
    });

    const hasNext = events.length > limit;
    const data = hasNext ? events.slice(0, -1) : events;
    const nextCursor = hasNext ? data[data.length - 1].id : null;

    return { data, nextCursor };
  });

  return NextResponse.json(result);
}

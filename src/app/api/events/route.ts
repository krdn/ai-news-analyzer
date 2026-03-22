import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const celebrityId = searchParams.get("celebrityId");
  const days = parseInt(searchParams.get("days") || "30", 10);

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

  return NextResponse.json(events);
}

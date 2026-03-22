import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const celebrityId = searchParams.get("celebrityId");

  const where: Record<string, unknown> = {};
  if (celebrityId) {
    where.celebrityId = celebrityId;
  }

  const alerts = await prisma.alert.findMany({
    where,
    include: { celebrity: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(alerts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { celebrityId, alertType, threshold, channel, channelConfig } = body;

  if (!celebrityId || !alertType) {
    return NextResponse.json(
      { error: "celebrityId와 alertType은 필수입니다" },
      { status: 400 }
    );
  }

  const alert = await prisma.alert.create({
    data: {
      celebrityId,
      alertType,
      threshold: threshold ?? 0.3,
      channel: channel ?? "telegram",
      channelConfig: channelConfig ?? {},
    },
    include: { celebrity: { select: { id: true, name: true } } },
  });

  return NextResponse.json(alert, { status: 201 });
}

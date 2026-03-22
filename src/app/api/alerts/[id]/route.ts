import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const { alertType, threshold, channel, channelConfig, enabled } = body;

  const data: Record<string, unknown> = {};
  if (alertType !== undefined) data.alertType = alertType;
  if (threshold !== undefined) data.threshold = threshold;
  if (channel !== undefined) data.channel = channel;
  if (channelConfig !== undefined) data.channelConfig = channelConfig;
  if (enabled !== undefined) data.enabled = enabled;

  try {
    const alert = await prisma.alert.update({
      where: { id },
      data,
      include: { celebrity: { select: { id: true, name: true } } },
    });
    return NextResponse.json(alert);
  } catch {
    return NextResponse.json(
      { error: "알림을 찾을 수 없습니다" },
      { status: 404 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await prisma.alert.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "알림을 찾을 수 없습니다" },
      { status: 404 }
    );
  }
}

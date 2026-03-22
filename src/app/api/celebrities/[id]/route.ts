import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { updateCelebritySchema } from "@/entities/celebrity";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const celebrity = await prisma.celebrity.findUnique({
    where: { id },
    include: { sources: true },
  });

  if (!celebrity) {
    return NextResponse.json(
      { error: "셀럽을 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  return NextResponse.json(celebrity);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = updateCelebritySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "유효하지 않은 데이터", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const celebrity = await prisma.celebrity.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json(celebrity);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.celebrity.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

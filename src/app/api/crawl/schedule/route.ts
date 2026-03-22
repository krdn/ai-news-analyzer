import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import type { SourceType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const { celebrityId, sourceType, enabled } = (await request.json()) as {
      celebrityId: string;
      sourceType: SourceType;
      enabled: boolean;
    };

    if (!celebrityId || !sourceType || typeof enabled !== "boolean") {
      return NextResponse.json(
        { error: "celebrityId, sourceType, enabled 필드가 필요합니다" },
        { status: 400 }
      );
    }

    const existing = await prisma.celebritySource.findFirst({
      where: { celebrityId, sourceType },
    });

    let source;
    if (existing) {
      source = await prisma.celebritySource.update({
        where: { id: existing.id },
        data: { enabled },
      });
    } else {
      source = await prisma.celebritySource.create({
        data: { celebrityId, sourceType, searchKeywords: [], enabled },
      });
    }

    return NextResponse.json(source);
  } catch (error) {
    console.error("스케줄 업데이트 오류:", error);
    return NextResponse.json(
      { error: "스케줄 업데이트에 실패했습니다" },
      { status: 500 }
    );
  }
}

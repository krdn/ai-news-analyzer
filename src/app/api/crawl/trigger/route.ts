import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { crawlQueue } from "@/shared/lib/queue";
import type { SourceType } from "@prisma/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { celebrityId, sourceType } = body as {
      celebrityId?: string;
      sourceType?: SourceType;
    };

    // 개별 셀럽 + 특정 소스 크롤링
    if (celebrityId && sourceType) {
      await crawlQueue.add(`crawl-${sourceType.toLowerCase()}`, {
        celebrityId,
        sourceType,
      });
      return NextResponse.json({
        message: `크롤링 잡이 큐에 추가되었습니다 (${sourceType})`,
      });
    }

    // 개별 셀럽의 모든 활성 소스 크롤링
    if (celebrityId) {
      const sources = await prisma.celebritySource.findMany({
        where: { celebrityId, enabled: true },
        select: { sourceType: true },
      });

      for (const source of sources) {
        await crawlQueue.add(`crawl-${source.sourceType.toLowerCase()}`, {
          celebrityId,
          sourceType: source.sourceType,
        });
      }

      return NextResponse.json({
        message: `${sources.length}개 크롤링 잡이 큐에 추가되었습니다`,
      });
    }

    // 전체 셀럽의 모든 활성 소스 크롤링
    const sources = await prisma.celebritySource.findMany({
      where: { enabled: true },
      select: { celebrityId: true, sourceType: true },
    });

    for (const source of sources) {
      await crawlQueue.add(`crawl-${source.sourceType.toLowerCase()}`, {
        celebrityId: source.celebrityId,
        sourceType: source.sourceType,
      });
    }

    return NextResponse.json({
      message: `${sources.length}개 크롤링 잡이 큐에 추가되었습니다`,
    });
  } catch (error) {
    console.error("크롤링 트리거 오류:", error);
    return NextResponse.json(
      { error: "크롤링 트리거에 실패했습니다" },
      { status: 500 }
    );
  }
}

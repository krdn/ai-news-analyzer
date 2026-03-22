import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { crawlQueue } from "@/shared/lib/queue";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { celebrityId } = body;

    // 개별 셀럽 크롤링
    if (celebrityId) {
      await crawlQueue.add("crawl-naver", { celebrityId });
      return NextResponse.json({
        message: "크롤링 잡이 큐에 추가되었습니다",
      });
    }

    // 전체 셀럽 크롤링
    const celebrities = await prisma.celebrity.findMany({
      select: { id: true },
    });

    for (const celeb of celebrities) {
      await crawlQueue.add("crawl-naver", { celebrityId: celeb.id });
    }

    return NextResponse.json({
      message: `${celebrities.length}개 크롤링 잡이 큐에 추가되었습니다`,
    });
  } catch (error) {
    console.error("크롤링 트리거 오류:", error);
    return NextResponse.json(
      { error: "크롤링 트리거에 실패했습니다" },
      { status: 500 }
    );
  }
}

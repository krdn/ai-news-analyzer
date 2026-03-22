import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { days, dryRun = false } = body as { days: number; dryRun?: boolean };

  if (!days || days < 30) {
    return NextResponse.json(
      { error: "days는 30 이상이어야 합니다" },
      { status: 400 }
    );
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  if (dryRun) {
    // 영향받을 행 수만 조회
    const articlesToDelete = await prisma.article.count({
      where: { collectedAt: { lt: cutoff } },
    });
    const commentsToDelete = await prisma.comment.count({
      where: { article: { collectedAt: { lt: cutoff } } },
    });

    return NextResponse.json({
      dryRun: true,
      cutoffDate: cutoff.toISOString(),
      articlesToDelete,
      commentsToDelete,
    });
  }

  // 댓글 먼저 삭제 (FK 제약), 그 다음 기사 삭제
  const deletedComments = await prisma.comment.deleteMany({
    where: { article: { collectedAt: { lt: cutoff } } },
  });

  const deletedArticles = await prisma.article.deleteMany({
    where: { collectedAt: { lt: cutoff } },
  });

  return NextResponse.json({
    dryRun: false,
    cutoffDate: cutoff.toISOString(),
    deletedArticles: deletedArticles.count,
    deletedComments: deletedComments.count,
  });
}

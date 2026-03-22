import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  const days = parseInt(searchParams.get("days") ?? "30");

  if (!idsParam) {
    return NextResponse.json(
      { error: "ids 파라미터가 필요합니다" },
      { status: 400 }
    );
  }

  const ids = idsParam.split(",").filter(Boolean);

  if (ids.length < 2) {
    return NextResponse.json(
      { error: "비교를 위해 최소 2명의 셀럽 ID가 필요합니다" },
      { status: 400 }
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  // 셀럽 정보 + 스냅샷 + 토픽 집계를 병렬로 조회
  const results = await Promise.all(
    ids.map(async (id) => {
      const [celebrity, snapshots, topicComments] = await Promise.all([
        prisma.celebrity.findUnique({
          where: { id },
          select: { id: true, name: true, category: true, profileImage: true },
        }),
        prisma.sentimentSnapshot.findMany({
          where: {
            celebrityId: id,
            periodType: "DAILY",
            periodStart: { gte: since },
          },
          orderBy: { periodStart: "asc" },
        }),
        // DEEP 분석이 완료되고 topics가 있는 댓글에서 토픽 점수 집계
        prisma.comment.findMany({
          where: {
            article: { celebrityId: id },
            analysisDepth: "DEEP",
            topics: { isEmpty: false },
          },
          select: { topics: true },
        }),
      ]);

      // topics는 "topic:score" 형태의 문자열 배열
      // 토픽별 점수를 집계하여 평균 산출
      const topicMap: Record<string, { total: number; count: number }> = {};
      for (const comment of topicComments) {
        for (const entry of comment.topics) {
          const colonIdx = entry.lastIndexOf(":");
          if (colonIdx === -1) continue;
          const topic = entry.slice(0, colonIdx);
          const score = parseFloat(entry.slice(colonIdx + 1));
          if (isNaN(score)) continue;
          if (!topicMap[topic]) {
            topicMap[topic] = { total: 0, count: 0 };
          }
          topicMap[topic].total += score;
          topicMap[topic].count += 1;
        }
      }

      // 평균 점수 계산
      const topics: Record<string, number> = {};
      for (const [topic, { total, count }] of Object.entries(topicMap)) {
        topics[topic] = total / count;
      }

      return { celebrity, snapshots, topics };
    })
  );

  return NextResponse.json({ results, days });
}

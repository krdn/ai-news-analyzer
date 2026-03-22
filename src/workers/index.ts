import { Worker } from "bullmq";
import { redis } from "../shared/lib/redis";
import { QUEUE_NAMES, snapshotQueue } from "../shared/lib/queue";
import { prisma } from "../shared/lib/prisma";
import { crawlNaverForCelebrity } from "./crawler/naver";
import { analyzeSentiment } from "./analyzer/sentiment";
import { aggregateComments } from "./snapshot/aggregator";

// --- Crawl Worker ---
// 셀러브리티 뉴스 크롤링 워커
const crawlWorker = new Worker(
  QUEUE_NAMES.CRAWL,
  async (job) => {
    const { celebrityId } = job.data as { celebrityId: string };
    console.log(`[Crawl] 크롤링 시작: ${celebrityId}`);
    await crawlNaverForCelebrity(celebrityId);
    console.log(`[Crawl] 크롤링 완료: ${celebrityId}`);
  },
  {
    connection: redis,
    concurrency: 2,
    limiter: {
      max: 1,
      duration: 2000,
    },
  }
);

// --- Analysis Worker ---
// 감성 분석 워커: 미분석 댓글에 대해 감성 분석 수행
const analysisWorker = new Worker(
  QUEUE_NAMES.ANALYSIS,
  async (job) => {
    const { articleId, celebrityId } = job.data as {
      articleId: string;
      celebrityId: string;
    };
    console.log(`[Analysis] 분석 시작: article=${articleId}`);

    // sentimentScore가 null인 미분석 댓글 조회
    const comments = await prisma.comment.findMany({
      where: {
        articleId,
        sentimentScore: null,
      },
    });

    // 각 댓글에 대해 감성 분석 수행 및 DB 업데이트
    for (const comment of comments) {
      const result = analyzeSentiment(comment.content);
      await prisma.comment.update({
        where: { id: comment.id },
        data: {
          sentimentScore: result.score,
          sentimentLabel: result.label,
          sentimentConfidence: result.confidence,
        },
      });
    }

    console.log(`[Analysis] 분석 완료: ${comments.length}개 댓글 처리`);

    // 분석 완료 후 스냅샷 큐에 추가
    await snapshotQueue.add("create-snapshot", { celebrityId });
  },
  {
    connection: redis,
    concurrency: 3,
  }
);

// --- Snapshot Worker ---
// 스냅샷 워커: 현재 시간대 댓글을 집계하여 스냅샷 생성/업데이트
const snapshotWorker = new Worker(
  QUEUE_NAMES.SNAPSHOT,
  async (job) => {
    const { celebrityId } = job.data as { celebrityId: string };
    console.log(`[Snapshot] 스냅샷 생성 시작: ${celebrityId}`);

    // 현재 시간의 정각(hour) 기준으로 기간 설정
    const now = new Date();
    const periodStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      0,
      0,
      0
    );

    // 해당 셀러브리티의 분석 완료된 댓글 조회 (현재 시간대)
    const comments = await prisma.comment.findMany({
      where: {
        article: { celebrityId },
        sentimentLabel: { not: null },
        sentimentScore: { not: null },
      },
      select: {
        sentimentLabel: true,
        sentimentScore: true,
        emotions: true,
        topics: true,
      },
    });

    // 집계
    const aggregation = aggregateComments(
      comments.map((c) => ({
        sentimentLabel: c.sentimentLabel!,
        sentimentScore: c.sentimentScore!,
        emotions: (c.emotions as string[]) ?? [],
        topics: (c.topics as string[]) ?? [],
      }))
    );

    // 스냅샷 upsert (snapshot_unique 복합키 사용)
    await prisma.sentimentSnapshot.upsert({
      where: {
        snapshot_unique: {
          celebrityId,
          periodType: "HOURLY",
          periodStart,
          sourceType: "ALL",
        },
      },
      update: {
        totalComments: aggregation.totalComments,
        avgScore: aggregation.avgScore,
        positiveCount: aggregation.positiveCount,
        neutralCount: aggregation.neutralCount,
        negativeCount: aggregation.negativeCount,
        topEmotions: aggregation.topEmotions,
        topTopics: aggregation.topTopics,
      },
      create: {
        celebrityId,
        periodType: "HOURLY",
        periodStart,
        sourceType: "ALL",
        totalComments: aggregation.totalComments,
        avgScore: aggregation.avgScore,
        positiveCount: aggregation.positiveCount,
        neutralCount: aggregation.neutralCount,
        negativeCount: aggregation.negativeCount,
        topEmotions: aggregation.topEmotions,
        topTopics: aggregation.topTopics,
      },
    });

    console.log(
      `[Snapshot] 스냅샷 완료: ${celebrityId} (${aggregation.totalComments}개 댓글)`
    );
  },
  {
    connection: redis,
    concurrency: 1,
  }
);

// --- 에러 핸들러 ---
crawlWorker.on("failed", (job, err) => {
  console.error(`[Crawl] 작업 실패: ${job?.id}`, err.message);
});

analysisWorker.on("failed", (job, err) => {
  console.error(`[Analysis] 작업 실패: ${job?.id}`, err.message);
});

snapshotWorker.on("failed", (job, err) => {
  console.error(`[Snapshot] 작업 실패: ${job?.id}`, err.message);
});

// --- Graceful Shutdown ---
async function shutdown() {
  console.log("[Worker] 종료 시그널 수신, 워커 종료 중...");
  await Promise.all([
    crawlWorker.close(),
    analysisWorker.close(),
    snapshotWorker.close(),
  ]);
  console.log("[Worker] 모든 워커 종료 완료");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("[Worker] 모든 워커 시작 완료");
console.log(`  - Crawl Worker (concurrency: 2, rate limit: 1/2s)`);
console.log(`  - Analysis Worker (concurrency: 3)`);
console.log(`  - Snapshot Worker (concurrency: 1)`);

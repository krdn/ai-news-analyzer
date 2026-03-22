import { Worker } from "bullmq";
import { redis } from "../shared/lib/redis";
import { QUEUE_NAMES, crawlQueue, snapshotQueue } from "../shared/lib/queue";
import { prisma } from "../shared/lib/prisma";
import { crawlerRegistry, processCrawlResult } from "./crawler/registry";
import { NaverCrawlerPlugin } from "./crawler/naver";
import { YouTubeCrawlerPlugin } from "./crawler/youtube";
import { TwitterCrawlerPlugin } from "./crawler/twitter";
import { MetaCrawlerPlugin } from "./crawler/meta";
import { DcinsideCrawlerPlugin } from "./crawler/dcinside";
import { analyzeSentiment } from "./analyzer/sentiment";
import { aggregateComments } from "./snapshot/aggregator";
import type { SourceType } from "@prisma/client";

// --- 크롤러 플러그인 등록 ---
const dcinsidePlugin = new DcinsideCrawlerPlugin();

crawlerRegistry.register(new NaverCrawlerPlugin());
crawlerRegistry.register(new YouTubeCrawlerPlugin());
crawlerRegistry.register(new TwitterCrawlerPlugin());
crawlerRegistry.register(new MetaCrawlerPlugin());
crawlerRegistry.register(dcinsidePlugin);

console.log(
  `[Registry] 등록된 크롤러: ${crawlerRegistry.getRegisteredTypes().join(", ")}`
);

// --- 소스별 크롤링 주기 (ms) ---
const CRAWL_INTERVALS: Record<string, number> = {
  NAVER: 30 * 60 * 1000, // 30분
  YOUTUBE: 60 * 60 * 1000, // 1시간
  X: 2 * 60 * 60 * 1000, // 2시간
  META: 2 * 60 * 60 * 1000, // 2시간
  COMMUNITY: 60 * 60 * 1000, // 1시간
};

// --- Crawl Worker ---
// 셀러브리티 뉴스 크롤링 워커 (플러그인 레지스트리 기반)
const crawlWorker = new Worker(
  QUEUE_NAMES.CRAWL,
  async (job) => {
    const { celebrityId, sourceType } = job.data as {
      celebrityId: string;
      sourceType: SourceType;
    };

    const plugin = crawlerRegistry.get(sourceType);
    if (!plugin) {
      console.warn(
        `[Crawl] 등록되지 않은 소스 타입: ${sourceType}, 건너뜀`
      );
      return;
    }

    // DB에서 검색 키워드 조회
    const source = await prisma.celebritySource.findFirst({
      where: { celebrityId, sourceType, enabled: true },
      select: { searchKeywords: true },
    });

    if (!source) {
      console.warn(
        `[Crawl] 활성 소스 없음: ${celebrityId}/${sourceType}, 건너뜀`
      );
      return;
    }

    console.log(
      `[Crawl] 크롤링 시작: ${celebrityId} (${sourceType}), 키워드: ${source.searchKeywords.join(", ")}`
    );

    const result = await plugin.crawl(celebrityId, source.searchKeywords);
    const { articlesCreated, commentsCreated } = await processCrawlResult(
      result,
      celebrityId,
      sourceType
    );

    console.log(
      `[Crawl] 크롤링 완료: ${celebrityId} (${sourceType}) - 기사 ${articlesCreated}개, 댓글 ${commentsCreated}개`
    );
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

// --- 스케줄러: DB 기반 자동 크롤링 ---
async function setupSchedules(): Promise<void> {
  console.log("[Scheduler] 기존 반복 작업 정리 중...");

  // 기존 반복 작업(repeatable jobs) 모두 제거
  const repeatableJobs = await crawlQueue.getRepeatableJobs();
  for (const job of repeatableJobs) {
    await crawlQueue.removeRepeatableByKey(job.key);
  }
  console.log(
    `[Scheduler] 기존 반복 작업 ${repeatableJobs.length}개 제거 완료`
  );

  // DB에서 활성화된 소스 조회
  const sources = await prisma.celebritySource.findMany({
    where: { enabled: true },
    select: {
      celebrityId: true,
      sourceType: true,
    },
  });

  // 각 소스에 대해 반복 작업 등록
  let scheduled = 0;
  for (const source of sources) {
    const interval = CRAWL_INTERVALS[source.sourceType];
    if (!interval) {
      console.warn(
        `[Scheduler] 크롤링 주기 미정의: ${source.sourceType}, 건너뜀`
      );
      continue;
    }

    await crawlQueue.add(
      `crawl-${source.sourceType.toLowerCase()}`,
      {
        celebrityId: source.celebrityId,
        sourceType: source.sourceType,
      },
      {
        repeat: {
          every: interval,
        },
        jobId: `schedule-${source.celebrityId}-${source.sourceType}`,
      }
    );
    scheduled++;
  }

  console.log(
    `[Scheduler] ${scheduled}개 반복 크롤링 작업 등록 완료 (총 소스: ${sources.length}개)`
  );
}

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

  // Playwright 브라우저 정리
  await dcinsidePlugin.closeBrowser();
  console.log("[Worker] Playwright 브라우저 정리 완료");

  console.log("[Worker] 모든 워커 종료 완료");
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// --- 스케줄러 초기화 ---
setupSchedules().catch((err) => {
  console.error("[Scheduler] 스케줄 설정 실패:", err);
});

console.log("[Worker] 모든 워커 시작 완료");
console.log(`  - Crawl Worker (concurrency: 2, rate limit: 1/2s)`);
console.log(`  - Analysis Worker (concurrency: 3)`);
console.log(`  - Snapshot Worker (concurrency: 1)`);

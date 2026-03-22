import "dotenv/config";
import { Worker } from "bullmq";
import { redis } from "../shared/lib/redis";
import {
  QUEUE_NAMES,
  crawlQueue,
  deepAnalysisQueue,
  snapshotQueue,
} from "../shared/lib/queue";
import { prisma } from "../shared/lib/prisma";
import { crawlerRegistry, processCrawlResult } from "./crawler/registry";
import { NaverCrawlerPlugin } from "./crawler/naver";
import { YouTubeCrawlerPlugin } from "./crawler/youtube";
import { TwitterCrawlerPlugin } from "./crawler/twitter";
import { MetaCrawlerPlugin } from "./crawler/meta";
import { DcinsideCrawlerPlugin } from "./crawler/dcinside";
import { analyzeSentiment } from "./analyzer/sentiment";
import { processDeepAnalysisBatch } from "./analyzer/deep-analysis";
import { aggregateComments } from "./snapshot/aggregator";
import { detectSentimentAnomaly } from "./event-detector";
import { formatEventAlert, sendTelegramMessage } from "./notifier/telegram";
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

    // 각 댓글에 대해 1단계 감성 분석 수행 및 DB 업데이트
    for (const comment of comments) {
      const result = analyzeSentiment(comment.content);
      await prisma.comment.update({
        where: { id: comment.id },
        data: {
          sentimentScore: result.score,
          sentimentLabel: result.label,
          sentimentConfidence: result.confidence,
          analysisDepth: "BASIC",
        },
      });
    }

    console.log(`[Analysis] 1단계 분석 완료: ${comments.length}개 댓글 처리`);

    // 2단계 심층 분석 대상 판단: 낮은 신뢰도 또는 긴 댓글
    const hasDeepTargets = comments.some(
      (c) =>
        analyzeSentiment(c.content).confidence < 0.7 || c.content.length > 50
    );

    if (hasDeepTargets) {
      const celebrity = await prisma.celebrity.findUnique({
        where: { id: celebrityId },
        select: { name: true },
      });
      await deepAnalysisQueue.add("deep-analyze", {
        articleId,
        celebrityId,
        celebrityName: celebrity?.name ?? "알 수 없음",
      });
      console.log(
        `[Analysis] 심층 분석 대상 발견 → deepAnalysisQueue 전달`
      );
    } else {
      await snapshotQueue.add("create-snapshot", { celebrityId });
    }
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

    // 스냅샷 생성 후 감성 이상치 감지
    const celebrity = await prisma.celebrity.findUnique({
      where: { id: celebrityId },
      select: { name: true },
    });
    if (celebrity) {
      await detectSentimentAnomaly(celebrityId, celebrity.name);
    }

    console.log(
      `[Snapshot] 스냅샷 완료: ${celebrityId} (${aggregation.totalComments}개 댓글)`
    );
  },
  {
    connection: redis,
    concurrency: 1,
  }
);

// --- Deep Analysis Worker ---
// 심층 분석 워커: Ollama LLM 기반 2단계 분석 (GPU 보호: concurrency 1)
const deepAnalysisWorker = new Worker(
  QUEUE_NAMES.DEEP_ANALYSIS,
  async (job) => {
    const { articleId, celebrityId, celebrityName } = job.data as {
      articleId: string;
      celebrityId: string;
      celebrityName: string;
    };
    console.log(`[DeepAnalysis] 심층 분석 시작: article=${articleId}`);
    const result = await processDeepAnalysisBatch(articleId, celebrityName);
    console.log(
      `[DeepAnalysis] 완료: 분석 ${result.analyzed}개, 스킵 ${result.skipped}개, 실패 ${result.failed}개`
    );
    await snapshotQueue.add("create-snapshot", { celebrityId });
  },
  { connection: redis, concurrency: 1 }
);

// --- Alert Worker ---
// 알림 워커: 이벤트 감지 시 등록된 알림 규칙에 따라 Telegram 발송
const alertWorker = new Worker(
  QUEUE_NAMES.ALERT,
  async (job) => {
    const { eventId, celebrityId, celebrityName } = job.data as {
      eventId: string;
      celebrityId: string;
      celebrityName: string;
    };

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      console.warn(`[Alert] 이벤트를 찾을 수 없음: ${eventId}`);
      return;
    }

    // 해당 셀러브리티의 활성 알림 규칙 조회
    const alerts = await prisma.alert.findMany({
      where: { celebrityId, enabled: true },
    });

    for (const alert of alerts) {
      // 방향 필터링: sentiment_drop이면 하락만, sentiment_spike이면 상승만
      const isDropped = event.sentimentAfter < event.sentimentBefore;
      if (alert.alertType === "sentiment_drop" && !isDropped) continue;
      if (alert.alertType === "sentiment_spike" && isDropped) continue;

      // 임계값 필터링: impactScore가 threshold 미만이면 무시
      if (event.impactScore < alert.threshold) continue;

      if (alert.channel === "telegram") {
        try {
          const message = formatEventAlert(
            {
              title: event.title,
              sentimentBefore: event.sentimentBefore,
              sentimentAfter: event.sentimentAfter,
              impactScore: event.impactScore,
              eventDate: event.eventDate.toISOString(),
            },
            celebrityName
          );
          await sendTelegramMessage(message);
          console.log(
            `[Alert] Telegram 발송 완료: alertId=${alert.id}, eventId=${eventId}`
          );
        } catch (err) {
          console.error(
            `[Alert] Telegram 발송 실패: alertId=${alert.id}`,
            err instanceof Error ? err.message : err
          );
        }
      }

      // 마지막 트리거 시각 업데이트
      await prisma.alert.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: new Date() },
      });
    }
  },
  { connection: redis, concurrency: 1 }
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

deepAnalysisWorker.on("failed", (job, err) => {
  console.error(`[DeepAnalysis] 작업 실패: ${job?.id}`, err.message);
});

alertWorker.on("failed", (job, err) => {
  console.error(`[Alert] 작업 실패: ${job?.id}`, err.message);
});

// --- Graceful Shutdown ---
async function shutdown() {
  console.log("[Worker] 종료 시그널 수신, 워커 종료 중...");
  await Promise.all([
    crawlWorker.close(),
    analysisWorker.close(),
    deepAnalysisWorker.close(),
    snapshotWorker.close(),
    alertWorker.close(),
  ]);

  // Playwright 브라우저 정리
  const { closeNaverBrowser } = await import("./crawler/naver");
  await closeNaverBrowser();
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
console.log(`  - Deep Analysis Worker (concurrency: 1, GPU 보호)`);
console.log(`  - Snapshot Worker (concurrency: 1)`);
console.log(`  - Alert Worker (concurrency: 1)`);

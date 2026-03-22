/**
 * 이벤트 자동 감지 엔진
 * Z-score ±2σ 기반으로 감성 점수 급변을 탐지하여 이벤트를 자동 생성합니다.
 */

/** Z-score 계산 결과 */
export interface ZScoreResult {
  mean: number;
  stdDev: number;
  zScore: number;
}

/**
 * Z-score를 계산한다.
 * 데이터가 3개 미만이거나 표준편차가 0이면 zScore=0을 반환한다.
 */
export function calculateZScore(
  historicalScores: number[],
  currentScore: number
): ZScoreResult {
  if (historicalScores.length < 3) {
    const mean =
      historicalScores.length > 0
        ? historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length
        : 0;
    return { mean, stdDev: 0, zScore: 0 };
  }

  const mean =
    historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length;

  const variance =
    historicalScores.reduce((sum, val) => sum + (val - mean) ** 2, 0) /
    historicalScores.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return { mean, stdDev: 0, zScore: 0 };
  }

  const zScore = (currentScore - mean) / stdDev;
  return { mean, stdDev, zScore };
}

/**
 * |zScore|가 threshold를 초과하면 이상치로 판단한다.
 */
export function isAnomaly(zScore: number, threshold = 2): boolean {
  return Math.abs(zScore) > threshold;
}

/**
 * 감성 변화 방향에 따른 이벤트 제목을 생성한다.
 */
export function generateEventTitle(name: string, scoreDiff: number): string {
  const direction = scoreDiff >= 0 ? "상승" : "하락";
  return `${name} 감성 지수 급격한 ${direction} 감지`;
}

/**
 * 특정 셀러브리티의 감성 이상치를 감지하고, 이벤트를 자동 생성한다.
 * - 최근 24시간 시간별 스냅샷을 조회
 * - Z-score로 최신 스냅샷의 이상 여부 판단
 * - 6시간 이내 중복 이벤트가 없으면 새 이벤트 생성
 */
export async function detectSentimentAnomaly(
  celebrityId: string,
  celebrityName: string
): Promise<void> {
  // 동적 import로 prisma 로드 (테스트 격리를 위해)
  const { prisma } = await import("../shared/lib/prisma");

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 최근 24시간 시간별 스냅샷 조회
  const snapshots = await prisma.sentimentSnapshot.findMany({
    where: {
      celebrityId,
      periodType: "HOURLY",
      periodStart: { gte: twentyFourHoursAgo },
    },
    orderBy: { periodStart: "asc" },
    select: { avgScore: true, periodStart: true },
  });

  // 스냅샷이 3개 미만이면 판단 불가
  if (snapshots.length < 3) {
    return;
  }

  // 최신 스냅샷을 제외한 히스토리로 Z-score 계산
  const historicalScores = snapshots
    .slice(0, -1)
    .map((s) => s.avgScore);
  const latestScore = snapshots[snapshots.length - 1].avgScore;

  const { zScore, mean } = calculateZScore(historicalScores, latestScore);

  if (!isAnomaly(zScore)) {
    return;
  }

  // 6시간 이내 중복 이벤트 확인
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
  const recentEvent = await prisma.event.findFirst({
    where: {
      celebrityId,
      autoDetected: true,
      detectedAt: { gte: sixHoursAgo },
    },
  });

  if (recentEvent) {
    console.log(
      `[EventDetector] 중복 이벤트 방지: ${celebrityName} (6시간 이내 기존 이벤트 존재)`
    );
    return;
  }

  // 이벤트 생성
  const scoreDiff = latestScore - mean;
  const impactScore = Math.min(1.0, Math.abs(zScore) / 4);
  const title = generateEventTitle(celebrityName, scoreDiff);

  const event = await prisma.event.create({
    data: {
      celebrityId,
      title,
      description: `Z-score: ${zScore.toFixed(2)} (평균: ${mean.toFixed(3)}, 현재: ${latestScore.toFixed(3)})`,
      eventDate: now,
      detectedAt: now,
      sentimentBefore: mean,
      sentimentAfter: latestScore,
      impactScore,
      autoDetected: true,
    },
  });

  console.log(
    `[EventDetector] 이벤트 생성: ${title} (Z-score: ${zScore.toFixed(2)}, impact: ${impactScore.toFixed(2)})`
  );

  // 알림 큐에 이벤트 알림 작업 추가
  const { alertQueue } = await import("../shared/lib/queue");
  await alertQueue.add("process-alert", {
    eventId: event.id,
    celebrityId,
    celebrityName,
  });
  console.log(`[EventDetector] 알림 큐에 작업 추가: eventId=${event.id}`);
}

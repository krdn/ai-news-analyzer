// 2단계 딥 분석 대상 필터링 및 배치 오케스트레이션
import { OllamaClient } from "../../shared/lib/ollama";
import { analyzeWithLLM } from "./llm-analyzer";

interface CommentForFilter {
  sentimentConfidence: number | null;
  content: string;
  likes: number;
}

/**
 * 2단계 딥 분석 대상 여부를 판단한다.
 * - confidence가 null이거나 0.7 미만이면 대상
 * - 댓글 길이가 50자 초과면 대상
 * - 좋아요가 상위 임계값 이상이면 대상
 */
export function shouldDeepAnalyze(comment: CommentForFilter, topLikeThreshold: number): boolean {
  if (comment.sentimentConfidence === null || comment.sentimentConfidence < 0.7) return true;
  if (comment.content.length > 50) return true;
  if (comment.likes >= topLikeThreshold) return true;
  return false;
}

/**
 * 좋아요 상위 10% 임계값을 계산한다.
 * - 빈 목록이면 Infinity 반환 (모든 댓글이 대상에서 제외)
 * - 1개면 해당 값 반환
 */
export function calculateTopLikeThreshold(comments: { likes: number }[]): number {
  if (comments.length === 0) return Infinity;
  const sorted = [...comments].sort((a, b) => b.likes - a.likes);
  const topIndex = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
  return sorted[topIndex].likes;
}

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 기사별 2단계 딥 분석 배치 처리
 * 1. Ollama 가용성 확인
 * 2. analysisDepth != "DEEP"인 댓글 조회
 * 3. 필터링 후 LLM 분석 실행
 * 4. DB 업데이트
 */
export async function processDeepAnalysisBatch(
  articleId: number,
  celebrityName: string,
): Promise<{ analyzed: number; skipped: number; failed: number }> {
  const { prisma } = await import("@/shared/lib/prisma");

  // Ollama 가용성 확인
  const client = new OllamaClient();
  const available = await client.isAvailable();
  if (!available) {
    console.warn("Ollama 서버 불가 - 딥 분석 건너뜀");
    return { analyzed: 0, skipped: 0, failed: 0 };
  }

  // 분석 대상 댓글 조회 (1단계 완료, 2단계 미완료)
  const comments = await prisma.comment.findMany({
    where: {
      articleId,
      sentimentScore: { not: null },
      analysisDepth: { not: "DEEP" },
    },
    select: {
      id: true,
      content: true,
      likes: true,
      sentimentConfidence: true,
    },
  });

  if (comments.length === 0) {
    return { analyzed: 0, skipped: 0, failed: 0 };
  }

  // 좋아요 임계값 계산
  const topLikeThreshold = calculateTopLikeThreshold(
    comments.map((c) => ({ likes: c.likes })),
  );

  // 필터링
  const targets = comments.filter((c) =>
    shouldDeepAnalyze(
      {
        sentimentConfidence: c.sentimentConfidence,
        content: c.content,
        likes: c.likes,
      },
      topLikeThreshold,
    ),
  );

  let analyzed = 0;
  let failed = 0;
  const skipped = comments.length - targets.length;

  // 배치 처리
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);

    for (const comment of batch) {
      try {
        const result = await analyzeWithLLM(comment.content, celebrityName);
        if (!result) {
          failed++;
          continue;
        }

        // topics를 "topic:score" 문자열 배열로 직렬화
        const topicStrings = result.topics.map(
          (t) => `${t.topic}:${t.score}`,
        );

        await prisma.comment.update({
          where: { id: comment.id },
          data: {
            emotions: result.emotions,
            topics: topicStrings,
            sentimentScore: result.overallScore,
            sentimentLabel: result.overallLabel,
            analysisDepth: "DEEP",
          },
        });

        analyzed++;
      } catch (error) {
        console.error(`댓글 ${comment.id} 딥 분석 실패:`, error);
        failed++;
      }
    }

    // 마지막 배치가 아니면 대기
    if (i + BATCH_SIZE < targets.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { analyzed, skipped, failed };
}

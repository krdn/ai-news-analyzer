import type { SentimentLabel } from "@prisma/client";

interface CommentForAggregation {
  sentimentLabel: SentimentLabel;
  sentimentScore: number;
  emotions: string[];
  topics: string[];
}

interface AggregationResult {
  totalComments: number;
  avgScore: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  topEmotions: Record<string, number>;
  topTopics: Record<string, number>;
}

/** 댓글 목록을 집계하여 스냅샷 데이터를 생성한다 */
export function aggregateComments(
  comments: CommentForAggregation[]
): AggregationResult {
  if (comments.length === 0) {
    return {
      totalComments: 0,
      avgScore: 0,
      positiveCount: 0,
      neutralCount: 0,
      negativeCount: 0,
      topEmotions: {},
      topTopics: {},
    };
  }

  let positiveCount = 0;
  let negativeCount = 0;
  let neutralCount = 0;
  let scoreSum = 0;
  const emotionCounts: Record<string, number> = {};
  const topicCounts: Record<string, number> = {};

  for (const comment of comments) {
    scoreSum += comment.sentimentScore;

    // VERY_POSITIVE, POSITIVE → positiveCount
    // VERY_NEGATIVE, NEGATIVE → negativeCount
    // 나머지 → neutralCount
    if (
      comment.sentimentLabel === "VERY_POSITIVE" ||
      comment.sentimentLabel === "POSITIVE"
    ) {
      positiveCount++;
    } else if (
      comment.sentimentLabel === "VERY_NEGATIVE" ||
      comment.sentimentLabel === "NEGATIVE"
    ) {
      negativeCount++;
    } else {
      neutralCount++;
    }

    // 감정 집계
    for (const emotion of comment.emotions) {
      emotionCounts[emotion] = (emotionCounts[emotion] ?? 0) + 1;
    }

    // 토픽 집계
    for (const topic of comment.topics) {
      topicCounts[topic] = (topicCounts[topic] ?? 0) + 1;
    }
  }

  return {
    totalComments: comments.length,
    avgScore: scoreSum / comments.length,
    positiveCount,
    neutralCount,
    negativeCount,
    topEmotions: emotionCounts,
    topTopics: topicCounts,
  };
}

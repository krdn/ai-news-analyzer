import type { SentimentLabel, SourceType } from "@prisma/client";

// 댓글 + 기사 정보 (감성 분석 포함)
// RecentComment (features/sentiment-tracking)와 호환되는 타입
export interface CommentWithArticle {
  id: string;
  content: string;
  author: string | null;
  likes: number;
  publishedAt: string | null;
  sentimentScore: number | null;
  sentimentLabel: SentimentLabel | null;
  article: {
    title: string;
    sourceUrl: string;
    sourceType: SourceType;
  };
}

// 감성 라벨 한국어 매핑
export const SENTIMENT_LABEL_KO: Record<SentimentLabel, string> = {
  VERY_POSITIVE: "매우 긍정",
  POSITIVE: "긍정",
  NEUTRAL: "중립",
  NEGATIVE: "부정",
  VERY_NEGATIVE: "매우 부정",
};

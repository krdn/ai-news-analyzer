import type { SentimentLabel, SourceType } from "@prisma/client";

// 감성 스냅샷 데이터 포인트
export interface SentimentDataPoint {
  id: string;
  periodStart: string;
  periodType: "HOURLY" | "DAILY" | "WEEKLY";
  sourceType: SourceType;
  avgScore: number;
  totalComments: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  topEmotions: Record<string, number> | null;
  topTopics: Record<string, number> | null;
}

// 최근 댓글 (감성 분석 포함)
export interface RecentComment {
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

// API 응답 타입
export interface SentimentResponse {
  snapshots: SentimentDataPoint[];
  recentComments: RecentComment[];
}

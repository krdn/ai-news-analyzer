import type { SourceType } from "@prisma/client";

// 크롤링된 기사 데이터
export interface ParsedArticle {
  celebrityId: string;
  sourceType: SourceType;
  sourceUrl: string;
  title: string;
  content: string;
  author?: string;
  publishedAt: Date;
}

// 크롤링된 댓글 데이터
export interface ParsedComment {
  content: string;
  author: string;
  likes: number;
  publishedAt: Date;
}

// 크롤러 실행 결과
export interface CrawlerResult {
  articles: ParsedArticle[];
  comments: Map<string, ParsedComment[]>; // articleSourceUrl → comments
}

// 크롤러 플러그인 인터페이스
export interface CrawlerPlugin {
  sourceType: SourceType;
  crawl(celebrityId: string, keywords: string[]): Promise<CrawlerResult>;
}

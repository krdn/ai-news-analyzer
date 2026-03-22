import type { SourceType } from "@prisma/client";
import type { CrawlerPlugin, CrawlerResult } from "./types";

export class CrawlerRegistry {
  private plugins = new Map<SourceType, CrawlerPlugin>();

  register(plugin: CrawlerPlugin): void {
    this.plugins.set(plugin.sourceType, plugin);
  }

  get(sourceType: SourceType): CrawlerPlugin | undefined {
    return this.plugins.get(sourceType);
  }

  getRegisteredTypes(): SourceType[] {
    return Array.from(this.plugins.keys());
  }
}

// 크롤링 결과를 DB에 저장하고 분석 큐에 추가하는 공통 로직
export async function processCrawlResult(
  result: CrawlerResult,
  celebrityId: string,
  sourceType: SourceType
): Promise<{ articlesCreated: number; commentsCreated: number }> {
  const { prisma } = await import("@/shared/lib/prisma");
  const { analysisQueue } = await import("@/shared/lib/queue");

  let articlesCreated = 0;
  let commentsCreated = 0;

  for (const article of result.articles) {
    // 중복 기사 건너뛰기
    const existing = await prisma.article.findUnique({
      where: { sourceUrl: article.sourceUrl },
    });
    if (existing) continue;

    const saved = await prisma.article.create({
      data: {
        celebrityId: article.celebrityId,
        sourceType: article.sourceType,
        sourceUrl: article.sourceUrl,
        title: article.title,
        content: article.content,
        author: article.author,
        publishedAt: article.publishedAt,
      },
    });
    articlesCreated++;

    // 댓글 일괄 저장
    const comments = result.comments.get(article.sourceUrl) ?? [];
    if (comments.length > 0) {
      await prisma.comment.createMany({
        data: comments.map((c) => ({
          articleId: saved.id,
          content: c.content,
          author: c.author,
          likes: c.likes,
          publishedAt: c.publishedAt,
        })),
      });
      commentsCreated += comments.length;
    }

    // 분석 큐에 추가
    await analysisQueue.add("analyze-article", {
      articleId: saved.id,
      celebrityId,
    });
  }

  return { articlesCreated, commentsCreated };
}

// 전역 레지스트리 싱글턴
export const crawlerRegistry = new CrawlerRegistry();

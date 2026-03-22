import { describe, it, expect } from "vitest";
import { parseYouTubeSearchResponse, parseYouTubeComments, YouTubeCrawlerPlugin } from "./youtube";

describe("YouTube 크롤러", () => {
  it("검색 결과를 ParsedArticle로 변환한다", () => {
    const mockItems = [{
      id: { videoId: "abc123" },
      snippet: { title: "셀럽 인터뷰", description: "최신 인터뷰 영상", channelTitle: "뉴스채널", publishedAt: "2026-03-22T10:00:00Z" },
    }];
    const articles = parseYouTubeSearchResponse(mockItems, "celeb-id");
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("셀럽 인터뷰");
    expect(articles[0].sourceUrl).toBe("https://www.youtube.com/watch?v=abc123");
    expect(articles[0].sourceType).toBe("YOUTUBE");
    expect(articles[0].author).toBe("뉴스채널");
  });

  it("댓글을 ParsedComment로 변환한다", () => {
    const mockComments = [{
      snippet: { topLevelComment: { snippet: { textDisplay: "좋은 영상이에요", authorDisplayName: "사용자1", likeCount: 15, publishedAt: "2026-03-22T12:00:00Z" } } },
    }];
    const comments = parseYouTubeComments(mockComments);
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe("좋은 영상이에요");
    expect(comments[0].likes).toBe(15);
  });

  it("빈 결과를 처리한다", () => {
    expect(parseYouTubeSearchResponse([], "id")).toHaveLength(0);
    expect(parseYouTubeComments([])).toHaveLength(0);
  });

  it("sourceType이 YOUTUBE이다", () => {
    const plugin = new YouTubeCrawlerPlugin();
    expect(plugin.sourceType).toBe("YOUTUBE");
  });
});

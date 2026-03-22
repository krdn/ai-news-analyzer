import { describe, it, expect } from "vitest";
import { parseFacebookPosts, parseFacebookComments, MetaCrawlerPlugin } from "./meta";

describe("Meta 크롤러", () => {
  it("Facebook 게시물을 ParsedArticle로 변환한다", () => {
    const mockPosts = [{
      id: "page_123", message: "새로운 소식을 전합니다. 많은 관심 부탁드립니다.",
      created_time: "2026-03-22T10:00:00+0000",
      permalink_url: "https://www.facebook.com/page/posts/123",
    }];
    const articles = parseFacebookPosts(mockPosts, "celeb-id");
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("새로운 소식을 전합니다. 많은 관심 부탁드립니다.");
    expect(articles[0].sourceType).toBe("META");
  });

  it("Facebook 댓글을 ParsedComment로 변환한다", () => {
    const mockComments = [{
      id: "comment_1", message: "축하합니다!", from: { name: "팬1" },
      like_count: 5, created_time: "2026-03-22T12:00:00+0000",
    }];
    const comments = parseFacebookComments(mockComments);
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe("축하합니다!");
    expect(comments[0].author).toBe("팬1");
    expect(comments[0].likes).toBe(5);
  });

  it("빈 결과를 처리한다", () => {
    expect(parseFacebookPosts([], "id")).toHaveLength(0);
    expect(parseFacebookComments([])).toHaveLength(0);
  });

  it("message가 없는 게시물은 필터링한다", () => {
    const posts = [{ id: "1", created_time: "2026-03-22T10:00:00+0000", permalink_url: "https://fb.com/1" }];
    expect(parseFacebookPosts(posts as any, "id")).toHaveLength(0);
  });

  it("sourceType이 META이다", () => {
    const plugin = new MetaCrawlerPlugin();
    expect(plugin.sourceType).toBe("META");
  });
});

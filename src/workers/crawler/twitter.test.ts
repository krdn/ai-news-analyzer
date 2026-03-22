import { describe, it, expect } from "vitest";
import { parseTweets, TwitterCrawlerPlugin } from "./twitter";

describe("X(트위터) 크롤러", () => {
  it("트윗을 ParsedArticle로 변환한다", () => {
    const mockTweets = [{
      id: "123456", text: "셀럽 관련 트윗 내용입니다", author_id: "user1",
      created_at: "2026-03-22T10:00:00.000Z",
      public_metrics: { reply_count: 5, retweet_count: 10, like_count: 50 },
    }];
    const includes = { users: [{ id: "user1", username: "testuser", name: "테스트유저" }] };
    const articles = parseTweets(mockTweets, includes, "celeb-id");
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("셀럽 관련 트윗 내용입니다");
    expect(articles[0].sourceUrl).toBe("https://x.com/testuser/status/123456");
    expect(articles[0].sourceType).toBe("X");
    expect(articles[0].author).toBe("@testuser");
  });

  it("빈 트윗 목록을 처리한다", () => {
    expect(parseTweets([], { users: [] }, "id")).toHaveLength(0);
  });

  it("sourceType이 X이다", () => {
    const plugin = new TwitterCrawlerPlugin();
    expect(plugin.sourceType).toBe("X");
  });
});

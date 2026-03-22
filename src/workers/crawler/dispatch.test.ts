import { describe, it, expect, vi } from "vitest";
import { CrawlerRegistry } from "./registry";
import type { CrawlerPlugin } from "./types";

describe("크롤러 디스패치", () => {
  it("sourceType에 맞는 플러그인을 호출한다", async () => {
    const registry = new CrawlerRegistry();
    const mockCrawl = vi
      .fn()
      .mockResolvedValue({ articles: [], comments: new Map() });
    const plugin: CrawlerPlugin = { sourceType: "YOUTUBE", crawl: mockCrawl };
    registry.register(plugin);

    const crawler = registry.get("YOUTUBE");
    expect(crawler).toBeDefined();
    await crawler!.crawl("celeb-1", ["키워드"]);
    expect(mockCrawl).toHaveBeenCalledWith("celeb-1", ["키워드"]);
  });

  it("등록되지 않은 소스 타입은 undefined 반환", () => {
    const registry = new CrawlerRegistry();
    expect(registry.get("META")).toBeUndefined();
  });
});

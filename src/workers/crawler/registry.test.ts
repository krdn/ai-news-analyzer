import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrawlerRegistry } from "./registry";
import type { CrawlerPlugin, CrawlerResult } from "./types";

describe("CrawlerRegistry", () => {
  let registry: CrawlerRegistry;

  beforeEach(() => {
    registry = new CrawlerRegistry();
  });

  it("플러그인을 등록하고 조회할 수 있다", () => {
    const plugin: CrawlerPlugin = { sourceType: "NAVER", crawl: vi.fn() };
    registry.register(plugin);
    expect(registry.get("NAVER")).toBe(plugin);
  });

  it("등록되지 않은 소스 타입은 undefined를 반환한다", () => {
    expect(registry.get("YOUTUBE")).toBeUndefined();
  });

  it("등록된 모든 소스 타입을 반환한다", () => {
    const naver: CrawlerPlugin = { sourceType: "NAVER", crawl: vi.fn() };
    const youtube: CrawlerPlugin = { sourceType: "YOUTUBE", crawl: vi.fn() };
    registry.register(naver);
    registry.register(youtube);
    expect(registry.getRegisteredTypes()).toEqual(["NAVER", "YOUTUBE"]);
  });
});

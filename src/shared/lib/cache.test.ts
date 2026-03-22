import { describe, it, expect } from "vitest";
import { getCacheKey, parseCacheResult } from "./cache";

describe("캐시 유틸", () => {
  it("캐시 키를 생성한다", () => {
    expect(getCacheKey("celeb", "123", "sentiment")).toBe(
      "celeb:123:sentiment",
    );
  });
  it("JSON 캐시 결과를 파싱한다", () => {
    const data = { score: 0.5 };
    expect(parseCacheResult(JSON.stringify(data))).toEqual(data);
  });
  it("잘못된 JSON은 null", () => {
    expect(parseCacheResult("invalid")).toBeNull();
    expect(parseCacheResult(null)).toBeNull();
  });
});

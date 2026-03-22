import { describe, it, expect } from "vitest";
import { analyzeSentiment } from "./sentiment";

describe("감성 분석 (규칙 기반)", () => {
  it("긍정 키워드가 많으면 긍정으로 분류한다", () => {
    const result = analyzeSentiment("정말 대단하고 멋진 연기였어요 최고");
    expect(result.score).toBeGreaterThan(0);
    expect(["VERY_POSITIVE", "POSITIVE"]).toContain(result.label);
  });

  it("부정 키워드가 많으면 부정으로 분류한다", () => {
    const result = analyzeSentiment("최악이다 실망 짜증나 별로");
    expect(result.score).toBeLessThan(0);
    expect(["VERY_NEGATIVE", "NEGATIVE"]).toContain(result.label);
  });

  it("중립 텍스트는 중립으로 분류한다", () => {
    const result = analyzeSentiment("오늘 기자회견이 있었습니다");
    expect(result.label).toBe("NEUTRAL");
  });

  it("빈 텍스트는 중립으로 분류한다", () => {
    const result = analyzeSentiment("");
    expect(result.label).toBe("NEUTRAL");
    expect(result.confidence).toBe(0);
  });

  it("confidence 값을 반환한다", () => {
    const result = analyzeSentiment("정말 최고다 대박 사랑해");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

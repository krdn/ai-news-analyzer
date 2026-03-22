import { describe, it, expect } from "vitest";
import { shouldDeepAnalyze, calculateTopLikeThreshold } from "./deep-analysis";

describe("2단계 분석 대상 필터링", () => {
  it("confidence가 낮으면 대상이다", () => {
    expect(shouldDeepAnalyze({ sentimentConfidence: 0.3, content: "짧은 글", likes: 0 }, 100)).toBe(true);
  });
  it("confidence가 높고 짧으면 대상이 아니다", () => {
    expect(shouldDeepAnalyze({ sentimentConfidence: 0.9, content: "짧은 글", likes: 0 }, 100)).toBe(false);
  });
  it("길이가 50자 초과면 대상이다", () => {
    expect(shouldDeepAnalyze({ sentimentConfidence: 0.9, content: "가".repeat(51), likes: 0 }, 100)).toBe(true);
  });
  it("좋아요가 임계값 이상이면 대상이다", () => {
    expect(shouldDeepAnalyze({ sentimentConfidence: 0.9, content: "짧은 글", likes: 150 }, 100)).toBe(true);
  });
  it("confidence가 null이면 대상이다", () => {
    expect(shouldDeepAnalyze({ sentimentConfidence: null, content: "짧은 글", likes: 0 }, 100)).toBe(true);
  });
});

describe("좋아요 임계값 계산", () => {
  it("상위 10% 임계값을 계산한다", () => {
    const comments = [
      { likes: 100 }, { likes: 50 }, { likes: 30 }, { likes: 20 },
      { likes: 10 }, { likes: 5 }, { likes: 3 }, { likes: 2 },
      { likes: 1 }, { likes: 0 },
    ];
    const threshold = calculateTopLikeThreshold(comments);
    expect(threshold).toBe(100);
  });
  it("빈 목록은 Infinity를 반환한다", () => {
    expect(calculateTopLikeThreshold([])).toBe(Infinity);
  });
  it("1개 댓글은 해당 값을 반환한다", () => {
    expect(calculateTopLikeThreshold([{ likes: 5 }])).toBe(5);
  });
});

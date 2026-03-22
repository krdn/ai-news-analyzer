import { describe, it, expect } from "vitest";
import { calculateZScore, isAnomaly, generateEventTitle } from "./event-detector";

describe("이벤트 감지 엔진", () => {
  it("Z-score를 계산한다", () => {
    const scores = [0.3, 0.35, 0.28, 0.32, 0.31, 0.29, 0.33, 0.30];
    const result = calculateZScore(scores, -0.2);
    expect(result.mean).toBeCloseTo(0.31, 1);
    expect(result.stdDev).toBeGreaterThan(0);
    expect(result.zScore).toBeLessThan(-2);
  });

  it("표준편차가 0이면 Z-score는 0이다", () => {
    const scores = [0.5, 0.5, 0.5, 0.5];
    const result = calculateZScore(scores, 0.5);
    expect(result.zScore).toBe(0);
  });

  it("±2σ 초과이면 이상치로 판단한다", () => {
    expect(isAnomaly(2.5)).toBe(true);
    expect(isAnomaly(-2.1)).toBe(true);
    expect(isAnomaly(1.5)).toBe(false);
    expect(isAnomaly(-1.8)).toBe(false);
  });

  it("상승 이벤트 제목을 생성한다", () => {
    const title = generateEventTitle("홍길동", 0.5);
    expect(title).toContain("홍길동");
    expect(title).toContain("상승");
  });

  it("하락 이벤트 제목을 생성한다", () => {
    const title = generateEventTitle("홍길동", -0.5);
    expect(title).toContain("홍길동");
    expect(title).toContain("하락");
  });

  it("데이터가 3개 미만이면 stdDev 0 반환", () => {
    const scores = [0.3, 0.4];
    const result = calculateZScore(scores, 0.5);
    expect(result.zScore).toBe(0);
  });
});

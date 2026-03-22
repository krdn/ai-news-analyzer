import { describe, it, expect } from "vitest";
import { aggregateComments } from "./aggregator";
import type { SentimentLabel } from "@prisma/client";

describe("스냅샷 집계", () => {
  it("댓글 목록을 집계한다", () => {
    const comments = [
      { sentimentLabel: "POSITIVE" as SentimentLabel, sentimentScore: 0.5, emotions: ["응원"], topics: ["연기력"] },
      { sentimentLabel: "NEGATIVE" as SentimentLabel, sentimentScore: -0.3, emotions: ["실망"], topics: ["연기력"] },
      { sentimentLabel: "NEUTRAL" as SentimentLabel, sentimentScore: 0, emotions: [], topics: [] },
    ];
    const result = aggregateComments(comments);
    expect(result.totalComments).toBe(3);
    expect(result.positiveCount).toBe(1);
    expect(result.negativeCount).toBe(1);
    expect(result.neutralCount).toBe(1);
    expect(result.avgScore).toBeCloseTo(0.067, 2);
  });

  it("빈 댓글 목록을 처리한다", () => {
    const result = aggregateComments([]);
    expect(result.totalComments).toBe(0);
    expect(result.avgScore).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { QUEUE_NAMES } from "./queue";

describe("Queue 설정", () => {
  it("필요한 큐 이름이 모두 정의되어 있다", () => {
    expect(QUEUE_NAMES.CRAWL).toBe("crawl");
    expect(QUEUE_NAMES.ANALYSIS).toBe("analysis");
    expect(QUEUE_NAMES.SNAPSHOT).toBe("snapshot");
  });

  it("DEEP_ANALYSIS 큐 이름이 정의되어 있다", () => {
    expect(QUEUE_NAMES.DEEP_ANALYSIS).toBe("deep-analysis");
  });
});

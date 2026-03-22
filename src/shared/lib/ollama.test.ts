import { describe, it, expect } from "vitest";
import { OllamaClient, parseOllamaResponse } from "./ollama";

describe("OllamaClient", () => {
  it("기본 URL이 설정된다", () => {
    const client = new OllamaClient();
    expect(client.baseUrl).toBe("http://localhost:11434");
  });
  it("커스텀 URL을 받을 수 있다", () => {
    const client = new OllamaClient("http://ollama:11434");
    expect(client.baseUrl).toBe("http://ollama:11434");
  });
});

describe("parseOllamaResponse", () => {
  it("유효한 JSON 응답을 파싱한다", () => {
    const json = JSON.stringify({
      emotions: ["응원", "감동"],
      topics: [{ topic: "연기력", score: 0.8 }],
      overallScore: 0.7,
      overallLabel: "POSITIVE",
    });
    const result = parseOllamaResponse(json);
    expect(result).not.toBeNull();
    expect(result!.emotions).toEqual(["응원", "감동"]);
    expect(result!.topics).toHaveLength(1);
    expect(result!.overallScore).toBe(0.7);
  });
  it("잘못된 JSON은 null을 반환한다", () => {
    expect(parseOllamaResponse("not json")).toBeNull();
  });
  it("허용되지 않은 감정을 필터링한다", () => {
    const json = JSON.stringify({
      emotions: ["응원", "없는감정", "분노"],
      topics: [],
      overallScore: 0,
      overallLabel: "NEUTRAL",
    });
    const result = parseOllamaResponse(json);
    expect(result!.emotions).toEqual(["응원", "분노"]);
  });
  it("score를 -1~1 범위로 클램핑한다", () => {
    const json = JSON.stringify({
      emotions: [],
      topics: [{ topic: "연기력", score: 5.0 }],
      overallScore: -3.0,
      overallLabel: "VERY_NEGATIVE",
    });
    const result = parseOllamaResponse(json);
    expect(result!.topics[0].score).toBe(1.0);
    expect(result!.overallScore).toBe(-1.0);
  });
  it("잘못된 overallLabel을 score 기반으로 재계산한다", () => {
    const json = JSON.stringify({
      emotions: [],
      topics: [],
      overallScore: 0.8,
      overallLabel: "INVALID",
    });
    const result = parseOllamaResponse(json);
    expect(result!.overallLabel).toBe("VERY_POSITIVE");
  });
});

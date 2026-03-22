import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt, ANALYSIS_SYSTEM_PROMPT } from "./llm-analyzer";

describe("LLM 분석기", () => {
  it("시스템 프롬프트가 정의되어 있다", () => {
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("한국어 댓글 감성 분석");
    expect(ANALYSIS_SYSTEM_PROMPT).toContain("JSON");
  });
  it("분석 프롬프트를 생성한다", () => {
    const prompt = buildAnalysisPrompt("홍길동", "연기 정말 잘하네요");
    expect(prompt).toContain("홍길동");
    expect(prompt).toContain("연기 정말 잘하네요");
    expect(prompt).toContain("emotions");
    expect(prompt).toContain("topics");
    expect(prompt).toContain("overallScore");
  });
  it("빈 댓글에 대한 프롬프트도 생성한다", () => {
    const prompt = buildAnalysisPrompt("셀럽A", "");
    expect(prompt).toContain("셀럽A");
  });
});

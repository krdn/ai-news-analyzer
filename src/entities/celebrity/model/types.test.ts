import { describe, it, expect } from "vitest";
import { createCelebritySchema, updateCelebritySchema } from "./types";

describe("Celebrity Zod 스키마", () => {
  it("유효한 셀럽 생성 데이터를 파싱한다", () => {
    const data = {
      name: "홍길동",
      category: "ENTERTAINER",
      aliases: ["길동이", "홍씨"],
    };
    const result = createCelebritySchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it("이름 없이 생성하면 실패한다", () => {
    const data = { category: "ENTERTAINER" };
    const result = createCelebritySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("잘못된 카테고리는 실패한다", () => {
    const data = { name: "홍길동", category: "INVALID" };
    const result = createCelebritySchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it("부분 업데이트를 허용한다", () => {
    const data = { description: "새로운 설명" };
    const result = updateCelebritySchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

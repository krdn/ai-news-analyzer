// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/shared/lib/prisma";

describe("Celebrities API", () => {
  beforeEach(async () => {
    await prisma.celebrity.deleteMany();
  });

  it("셀럽을 생성할 수 있다", async () => {
    const celeb = await prisma.celebrity.create({
      data: {
        name: "테스트 셀럽",
        category: "ENTERTAINER",
        aliases: ["테셀"],
      },
    });
    expect(celeb.name).toBe("테스트 셀럽");
    expect(celeb.category).toBe("ENTERTAINER");
    expect(celeb.aliases).toContain("테셀");
  });

  it("셀럽 목록을 조회할 수 있다", async () => {
    await prisma.celebrity.createMany({
      data: [
        { name: "셀럽A", category: "POLITICIAN", aliases: [] },
        { name: "셀럽B", category: "ENTERTAINER", aliases: [] },
      ],
    });
    const celebs = await prisma.celebrity.findMany();
    expect(celebs).toHaveLength(2);
  });

  it("이름으로 검색할 수 있다", async () => {
    await prisma.celebrity.create({
      data: { name: "홍길동", category: "OTHER", aliases: ["길동이"] },
    });
    const result = await prisma.celebrity.findMany({
      where: {
        OR: [
          { name: { contains: "홍길", mode: "insensitive" } },
          { aliases: { has: "홍길" } },
        ],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("홍길동");
  });
});

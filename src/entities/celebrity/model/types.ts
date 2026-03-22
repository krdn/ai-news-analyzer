import { z } from "zod";
import type { Celebrity, CelebrityCategory } from "@prisma/client";

export type { Celebrity };

// 셀럽 생성 스키마
export const createCelebritySchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(["POLITICIAN", "ENTERTAINER", "OTHER"]),
  aliases: z.array(z.string()).default([]),
  profileImage: z.string().url().optional(),
  description: z.string().optional(),
});

export type CreateCelebrityInput = z.infer<typeof createCelebritySchema>;

// 셀럽 수정 스키마 (모든 필드 선택적)
export const updateCelebritySchema = createCelebritySchema.partial();

export type UpdateCelebrityInput = z.infer<typeof updateCelebritySchema>;

// 카테고리 한국어 라벨 매핑
export const CATEGORY_LABELS: Record<CelebrityCategory, string> = {
  POLITICIAN: "정치인",
  ENTERTAINER: "연예인",
  OTHER: "기타",
};

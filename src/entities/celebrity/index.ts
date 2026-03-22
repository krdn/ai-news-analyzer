export {
  createCelebritySchema,
  updateCelebritySchema,
  CATEGORY_LABELS,
} from "./model/types";
export type {
  Celebrity,
  CreateCelebrityInput,
  UpdateCelebrityInput,
} from "./model/types";

// UI 컴포넌트
export { CelebrityCard } from "./ui/celebrity-card";
export { CelebrityForm } from "./ui/celebrity-form";

// API 훅
export { useCelebrities, useCelebrity } from "./api/use-celebrities";

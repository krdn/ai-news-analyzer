export const SOURCE_TYPES = ["ALL", "NAVER", "YOUTUBE", "X", "META", "COMMUNITY"] as const;
export type SourceTypeValue = (typeof SOURCE_TYPES)[number];

export const CELEBRITY_CATEGORIES = ["POLITICIAN", "ENTERTAINER", "OTHER"] as const;
export type CelebrityCategoryValue = (typeof CELEBRITY_CATEGORIES)[number];

export const SENTIMENT_LABELS = ["VERY_POSITIVE", "POSITIVE", "NEUTRAL", "NEGATIVE", "VERY_NEGATIVE"] as const;

export const SENTIMENT_COLORS: Record<string, string> = {
  VERY_POSITIVE: "#22c55e",
  POSITIVE: "#86efac",
  NEUTRAL: "#a1a1aa",
  NEGATIVE: "#fca5a5",
  VERY_NEGATIVE: "#ef4444",
};

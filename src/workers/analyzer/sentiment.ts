// 1단계 감성 분석 워커 - 규칙 기반 MVP
// 한국어 감성 사전을 사용한 규칙 기반 분석 (Phase 2에서 ML 모델로 교체 예정)
import type { SentimentLabel } from "@prisma/client";

// 긍정 키워드 사전
const POSITIVE_WORDS = [
  "좋다", "좋아", "최고", "대단", "멋지", "훌륭", "감동", "사랑",
  "응원", "축하", "대박", "짱", "존경", "감사", "행복", "기쁘",
  "잘했", "잘한", "굿", "브라보", "멋있", "예쁘", "귀엽",
];

// 부정 키워드 사전
const NEGATIVE_WORDS = [
  "나쁘", "싫다", "싫어", "최악", "실망", "짜증", "화나", "분노",
  "별로", "쓰레기", "한심", "답답", "혐오", "역겹", "못생",
  "거짓", "사기", "비호감", "끔찍", "불쾌", "논란", "비판",
];

export interface SentimentResult {
  score: number;
  label: SentimentLabel;
  confidence: number;
}

export function analyzeSentiment(text: string): SentimentResult {
  if (!text.trim()) {
    return { score: 0, label: "NEUTRAL", confidence: 0 };
  }

  const lowerText = text.toLowerCase();
  let positiveCount = 0;
  let negativeCount = 0;

  for (const word of POSITIVE_WORDS) {
    if (lowerText.includes(word)) positiveCount++;
  }
  for (const word of NEGATIVE_WORDS) {
    if (lowerText.includes(word)) negativeCount++;
  }

  const total = positiveCount + negativeCount;
  if (total === 0) {
    return { score: 0, label: "NEUTRAL", confidence: 0.3 };
  }

  // 점수 계산: -1 ~ 1 범위로 정규화
  const rawScore = (positiveCount - negativeCount) / total;
  const score = Math.max(-1, Math.min(1, rawScore));

  // 신뢰도: 매칭된 키워드 수 기반 (최대 1)
  const confidence = Math.min(1, total / 5);

  // 라벨 결정
  let label: SentimentLabel;
  if (score >= 0.6) label = "VERY_POSITIVE";
  else if (score >= 0.2) label = "POSITIVE";
  else if (score > -0.2) label = "NEUTRAL";
  else if (score > -0.6) label = "NEGATIVE";
  else label = "VERY_NEGATIVE";

  return { score, label, confidence };
}

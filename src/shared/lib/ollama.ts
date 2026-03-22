// Ollama LLM 클라이언트 - 딥 감성 분석용
import type { SentimentLabel } from "@prisma/client";
import { SENTIMENT_LABELS } from "@/shared/config/constants";

// 허용된 감정 목록
const ALLOWED_EMOTIONS = [
  "응원", "감동", "기대", "호감",
  "실망", "분노", "조롱", "동정", "무관심",
] as const;

export type AllowedEmotion = (typeof ALLOWED_EMOTIONS)[number];

// 토픽별 감성 점수
export interface TopicSentiment {
  topic: string;
  score: number;
}

// 딥 분석 결과 타입
export interface DeepAnalysisResult {
  emotions: AllowedEmotion[];
  topics: TopicSentiment[];
  overallScore: number;
  overallLabel: SentimentLabel;
}

// score 기반 SentimentLabel 계산
function scoreToLabel(score: number): SentimentLabel {
  if (score >= 0.6) return "VERY_POSITIVE";
  if (score >= 0.2) return "POSITIVE";
  if (score > -0.2) return "NEUTRAL";
  if (score > -0.6) return "NEGATIVE";
  return "VERY_NEGATIVE";
}

// 값을 -1~1 범위로 클램핑
function clamp(value: number, min = -1, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Ollama JSON 응답을 파싱하고 검증한다.
 * - 허용되지 않은 감정 필터링
 * - score를 -1~1 범위로 클램핑
 * - 잘못된 overallLabel을 score 기반으로 재계산
 * - 파싱 실패 시 null 반환
 */
export function parseOllamaResponse(raw: string): DeepAnalysisResult | null {
  try {
    const parsed = JSON.parse(raw);

    // 기본 구조 검증
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.emotions) ||
      !Array.isArray(parsed.topics) ||
      typeof parsed.overallScore !== "number"
    ) {
      return null;
    }

    // 감정 필터링: 허용 목록에 있는 것만 유지
    const emotions = parsed.emotions.filter(
      (e: unknown): e is AllowedEmotion =>
        typeof e === "string" && ALLOWED_EMOTIONS.includes(e as AllowedEmotion)
    );

    // 토픽 점수 클램핑
    const topics: TopicSentiment[] = parsed.topics
      .filter(
        (t: unknown): t is { topic: string; score: number } =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as Record<string, unknown>).topic === "string" &&
          typeof (t as Record<string, unknown>).score === "number"
      )
      .map((t: { topic: string; score: number }) => ({
        topic: t.topic,
        score: clamp(t.score),
      }));

    // overallScore 클램핑
    const overallScore = clamp(parsed.overallScore);

    // overallLabel 검증 및 폴백
    const validLabels: readonly string[] = SENTIMENT_LABELS;
    const overallLabel: SentimentLabel = validLabels.includes(parsed.overallLabel)
      ? (parsed.overallLabel as SentimentLabel)
      : scoreToLabel(overallScore);

    return { emotions, topics, overallScore, overallLabel };
  } catch {
    return null;
  }
}

/**
 * Ollama REST API 클라이언트
 */
export class OllamaClient {
  readonly baseUrl: string;
  readonly model: string;

  constructor(
    baseUrl?: string,
    model?: string,
  ) {
    this.baseUrl = baseUrl ?? process.env.OLLAMA_URL ?? "http://localhost:11434";
    this.model = model ?? process.env.OLLAMA_MODEL ?? "gemma2:7b";
  }

  /**
   * Ollama /api/generate 엔드포인트 호출
   * JSON 형식 응답, 스트리밍 비활성화
   */
  async generate(system: string, prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          system,
          prompt,
          format: "json",
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 512,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Ollama API 오류: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as { response: string };
      return data.response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Ollama 서버 가용성 확인
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 모델 존재 여부 확인 후 없으면 pull
   */
  async ensureModel(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error("Ollama 서버에 접속할 수 없습니다");
    }

    const data = (await response.json()) as {
      models: Array<{ name: string }>;
    };

    const modelExists = data.models?.some(
      (m) => m.name === this.model || m.name.startsWith(`${this.model}:`)
    );

    if (!modelExists) {
      console.log(`모델 ${this.model} 다운로드 중...`);
      const pullResponse = await fetch(`${this.baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.model, stream: false }),
      });

      if (!pullResponse.ok) {
        throw new Error(`모델 pull 실패: ${pullResponse.statusText}`);
      }

      console.log(`모델 ${this.model} 다운로드 완료`);
    }
  }
}

// Ollama 기반 LLM 감성 분석기 - 프롬프트 빌더 + 분석 함수
import { OllamaClient, parseOllamaResponse, type DeepAnalysisResult } from "../../shared/lib/ollama";

export const ANALYSIS_SYSTEM_PROMPT = `당신은 한국어 댓글 감성 분석 전문가입니다.
댓글을 분석하여 반드시 아래 JSON 형식으로만 응답하세요.`;

export function buildAnalysisPrompt(celebrityName: string, content: string): string {
  return `셀럽: ${celebrityName}
댓글: ${content}

분석 결과를 JSON으로 반환하세요:
{
  "emotions": ["감정1", "감정2"],
  "topics": [{"topic": "주제", "score": 0.0}],
  "overallScore": 0.0,
  "overallLabel": "NEUTRAL"
}

emotions 허용 값: 응원, 감동, 기대, 호감, 실망, 분노, 조롱, 동정, 무관심
topics.score: -1.0 (매우 부정) ~ 1.0 (매우 긍정)
  주제 예시: 연기력, 외모, 인성, 발언, 사생활, 작품, 정책, 능력
overallScore: -1.0 ~ 1.0
overallLabel: VERY_POSITIVE, POSITIVE, NEUTRAL, NEGATIVE, VERY_NEGATIVE`;
}

let ollamaClient: OllamaClient | null = null;
function getClient(): OllamaClient {
  if (!ollamaClient) ollamaClient = new OllamaClient();
  return ollamaClient;
}

export async function analyzeWithLLM(content: string, celebrityName: string): Promise<DeepAnalysisResult | null> {
  const client = getClient();
  const responseText = await client.generate(ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt(celebrityName, content));
  if (!responseText) return null;
  return parseOllamaResponse(responseText);
}

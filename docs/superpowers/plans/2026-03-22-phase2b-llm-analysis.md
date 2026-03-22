# Phase 2B: Ollama LLM 심층 감성 분석 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 규칙 기반 1단계 분석 위에, Ollama gemma2:7b LLM을 활용한 2단계 심층 분석을 추가하여 복합 감정 분리, 감정 태깅, 주제별 감성 추출을 수행한다.

**Architecture:** 분석 워커(analysis worker)에서 1단계 완료 후 2단계 대상을 필터링하여 DEEP_ANALYSIS 큐에 추가. 별도 심층 분석 워커가 Ollama API를 호출하여 JSON 응답을 파싱하고 comments 테이블의 emotions[], topics[] 필드를 채운다.

**Tech Stack:** Ollama (gemma2:7b-instruct-q4), BullMQ, axios, Docker (NVIDIA GPU)

**Spec:** `docs/superpowers/specs/2026-03-22-phase2b-llm-analysis-design.md`

---

## 파일 구조

```
src/shared/lib/
├── ollama.ts              (신규) Ollama API 클라이언트
├── ollama.test.ts         (신규) 클라이언트 테스트
└── queue.ts               (수정) DEEP_ANALYSIS 큐 추가

src/workers/analyzer/
├── sentiment.ts           (변경 없음) 1단계 규칙 기반
├── llm-analyzer.ts        (신규) LLM 프롬프트 + JSON 파싱
├── llm-analyzer.test.ts   (신규)
├── deep-analysis.ts       (신규) 대상 필터링 + 배치 오케스트레이션
└── deep-analysis.test.ts  (신규)

src/workers/index.ts       (수정) deep analysis 워커 추가, analysis 워커 흐름 변경

docker-compose.yml         (수정) Ollama 서비스 추가
.env.example               (수정) OLLAMA_URL, OLLAMA_MODEL 추가
```

---

## Task 1: Ollama 클라이언트 + Docker Compose

**Files:**
- Create: `src/shared/lib/ollama.ts`
- Create: `src/shared/lib/ollama.test.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Ollama 클라이언트 테스트 작성**

```typescript
// src/shared/lib/ollama.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
pnpm vitest run src/shared/lib/ollama.test.ts
```

- [ ] **Step 3: Ollama 클라이언트 구현**

```typescript
// src/shared/lib/ollama.ts
import axios from "axios";
import type { SentimentLabel } from "@prisma/client";

const ALLOWED_EMOTIONS = [
  "응원", "감동", "기대", "호감",
  "실망", "분노", "조롱", "동정", "무관심",
] as const;

const VALID_LABELS: SentimentLabel[] = [
  "VERY_POSITIVE", "POSITIVE", "NEUTRAL", "NEGATIVE", "VERY_NEGATIVE",
];

export interface DeepAnalysisResult {
  emotions: string[];
  topics: Array<{ topic: string; score: number }>;
  overallScore: number;
  overallLabel: SentimentLabel;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreToLabel(score: number): SentimentLabel {
  if (score >= 0.6) return "VERY_POSITIVE";
  if (score >= 0.2) return "POSITIVE";
  if (score > -0.2) return "NEUTRAL";
  if (score > -0.6) return "NEGATIVE";
  return "VERY_NEGATIVE";
}

export function parseOllamaResponse(responseText: string): DeepAnalysisResult | null {
  try {
    const raw = JSON.parse(responseText);

    const emotions = (raw.emotions ?? [])
      .filter((e: string) => (ALLOWED_EMOTIONS as readonly string[]).includes(e));

    const topics = (raw.topics ?? []).map((t: { topic: string; score: number }) => ({
      topic: t.topic,
      score: clamp(t.score ?? 0, -1, 1),
    }));

    const overallScore = clamp(raw.overallScore ?? 0, -1, 1);

    const overallLabel = VALID_LABELS.includes(raw.overallLabel)
      ? raw.overallLabel as SentimentLabel
      : scoreToLabel(overallScore);

    return { emotions, topics, overallScore, overallLabel };
  } catch {
    return null;
  }
}

export class OllamaClient {
  public baseUrl: string;
  private model: string;

  constructor(
    baseUrl: string = process.env.OLLAMA_URL ?? "http://localhost:11434",
    model: string = process.env.OLLAMA_MODEL ?? "gemma2:7b"
  ) {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async generate(system: string, prompt: string): Promise<string | null> {
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/api/generate`,
        {
          model: this.model,
          system,
          prompt,
          format: "json",
          stream: false,
          options: {
            temperature: 0.1,
            num_predict: 512,
          },
        },
        { timeout: 30000 }
      );
      return data.response ?? null;
    } catch (err) {
      console.warn("[Ollama] 생성 실패:", (err as Error).message);
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async ensureModel(): Promise<void> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/tags`);
      const models = data.models?.map((m: { name: string }) => m.name) ?? [];
      const hasModel = models.some((name: string) => name.startsWith(this.model));
      if (!hasModel) {
        console.log(`[Ollama] 모델 다운로드 중: ${this.model}`);
        await axios.post(`${this.baseUrl}/api/pull`, { name: this.model }, { timeout: 600000 });
        console.log(`[Ollama] 모델 다운로드 완료: ${this.model}`);
      }
    } catch (err) {
      console.warn("[Ollama] 모델 확인 실패:", (err as Error).message);
    }
  }
}
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/shared/lib/ollama.test.ts
```

Expected: PASS (6/6)

- [ ] **Step 5: Docker Compose에 Ollama 추가**

`docker-compose.yml`에 추가:

```yaml
  ollama:
    image: ollama/ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
```

`volumes:`에 `ollama_data:` 추가.

`worker` 서비스에 `depends_on`에 `ollama` 추가, 환경 변수에 `OLLAMA_URL: http://ollama:11434` 추가.

- [ ] **Step 6: 커밋**

```bash
git add src/shared/lib/ollama.ts src/shared/lib/ollama.test.ts docker-compose.yml
git commit -m "feat: Ollama 클라이언트 및 Docker Compose 설정

OllamaClient 클래스 (generate, isAvailable, ensureModel)
- JSON 응답 파싱 + 검증 (감정 필터링, score 클램핑)
- Docker Compose에 Ollama GPU 서비스 추가

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: LLM 분석기 (프롬프트 + JSON 파싱)

**Files:**
- Create: `src/workers/analyzer/llm-analyzer.ts`
- Create: `src/workers/analyzer/llm-analyzer.test.ts`

- [ ] **Step 1: LLM 분석기 테스트 작성**

```typescript
// src/workers/analyzer/llm-analyzer.test.ts
import { describe, it, expect, vi } from "vitest";
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
pnpm vitest run src/workers/analyzer/llm-analyzer.test.ts
```

- [ ] **Step 3: LLM 분석기 구현**

```typescript
// src/workers/analyzer/llm-analyzer.ts
import { OllamaClient, parseOllamaResponse, type DeepAnalysisResult } from "@/shared/lib/ollama";

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
  if (!ollamaClient) {
    ollamaClient = new OllamaClient();
  }
  return ollamaClient;
}

export async function analyzeWithLLM(
  content: string,
  celebrityName: string
): Promise<DeepAnalysisResult | null> {
  const client = getClient();

  const responseText = await client.generate(
    ANALYSIS_SYSTEM_PROMPT,
    buildAnalysisPrompt(celebrityName, content)
  );

  if (!responseText) return null;

  return parseOllamaResponse(responseText);
}
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/workers/analyzer/llm-analyzer.test.ts
```

Expected: PASS (3/3)

- [ ] **Step 5: 커밋**

```bash
git add src/workers/analyzer/llm-analyzer.ts src/workers/analyzer/llm-analyzer.test.ts
git commit -m "feat: LLM 감성 분석기 구현

Ollama 기반 심층 분석 프롬프트 + JSON 파싱
- 시스템/사용자 프롬프트 빌더
- analyzeWithLLM() 함수

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 2단계 대상 필터링 + 배치 오케스트레이션

**Files:**
- Create: `src/workers/analyzer/deep-analysis.ts`
- Create: `src/workers/analyzer/deep-analysis.test.ts`

- [ ] **Step 1: 필터링 + 오케스트레이션 테스트 작성**

```typescript
// src/workers/analyzer/deep-analysis.test.ts
import { describe, it, expect } from "vitest";
import { shouldDeepAnalyze, calculateTopLikeThreshold } from "./deep-analysis";

describe("2단계 분석 대상 필터링", () => {
  it("confidence가 낮으면 대상이다", () => {
    expect(shouldDeepAnalyze(
      { sentimentConfidence: 0.3, content: "짧은 글", likes: 0 },
      100
    )).toBe(true);
  });

  it("confidence가 높고 짧으면 대상이 아니다", () => {
    expect(shouldDeepAnalyze(
      { sentimentConfidence: 0.9, content: "짧은 글", likes: 0 },
      100
    )).toBe(false);
  });

  it("길이가 50자 초과면 대상이다", () => {
    const longText = "가".repeat(51);
    expect(shouldDeepAnalyze(
      { sentimentConfidence: 0.9, content: longText, likes: 0 },
      100
    )).toBe(true);
  });

  it("좋아요가 임계값 이상이면 대상이다", () => {
    expect(shouldDeepAnalyze(
      { sentimentConfidence: 0.9, content: "짧은 글", likes: 150 },
      100
    )).toBe(true);
  });

  it("confidence가 null이면 대상이다", () => {
    expect(shouldDeepAnalyze(
      { sentimentConfidence: null, content: "짧은 글", likes: 0 },
      100
    )).toBe(true);
  });
});

describe("좋아요 임계값 계산", () => {
  it("상위 10% 임계값을 계산한다", () => {
    const comments = [
      { likes: 100 }, { likes: 50 }, { likes: 30 }, { likes: 20 },
      { likes: 10 }, { likes: 5 }, { likes: 3 }, { likes: 2 },
      { likes: 1 }, { likes: 0 },
    ];
    const threshold = calculateTopLikeThreshold(comments);
    expect(threshold).toBe(100); // 상위 10% = 1개 = likes 100
  });

  it("빈 목록은 Infinity를 반환한다", () => {
    expect(calculateTopLikeThreshold([])).toBe(Infinity);
  });

  it("1개 댓글은 해당 값을 반환한다", () => {
    expect(calculateTopLikeThreshold([{ likes: 5 }])).toBe(5);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
pnpm vitest run src/workers/analyzer/deep-analysis.test.ts
```

- [ ] **Step 3: 필터링 + 오케스트레이션 구현**

```typescript
// src/workers/analyzer/deep-analysis.ts
import { analyzeWithLLM } from "./llm-analyzer";
import { OllamaClient } from "@/shared/lib/ollama";

interface CommentForFilter {
  sentimentConfidence: number | null;
  content: string;
  likes: number;
}

export function shouldDeepAnalyze(
  comment: CommentForFilter,
  topLikeThreshold: number
): boolean {
  if (comment.sentimentConfidence === null || comment.sentimentConfidence < 0.7) return true;
  if (comment.content.length > 50) return true;
  if (comment.likes >= topLikeThreshold) return true;
  return false;
}

export function calculateTopLikeThreshold(comments: { likes: number }[]): number {
  if (comments.length === 0) return Infinity;
  const sorted = [...comments].sort((a, b) => b.likes - a.likes);
  const topIndex = Math.max(0, Math.floor(sorted.length * 0.1) - 1);
  return sorted[topIndex].likes;
}

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 1000;

export async function processDeepAnalysisBatch(
  articleId: string,
  celebrityName: string
): Promise<{ analyzed: number; skipped: number; failed: number }> {
  const { prisma } = await import("@/shared/lib/prisma");
  const client = new OllamaClient();

  // Ollama 가용성 확인
  if (!(await client.isAvailable())) {
    console.warn("[DeepAnalysis] Ollama 서비스 불가, 건너뜀");
    return { analyzed: 0, skipped: 0, failed: 0 };
  }

  // 1단계 분석 완료 + 2단계 미완료 댓글 조회
  const allComments = await prisma.comment.findMany({
    where: {
      articleId,
      sentimentScore: { not: null },
      analysisDepth: { not: "DEEP" },
    },
    select: {
      id: true,
      content: true,
      likes: true,
      sentimentConfidence: true,
    },
  });

  const topLikeThreshold = calculateTopLikeThreshold(allComments);

  const targets = allComments.filter((c) =>
    shouldDeepAnalyze(
      { sentimentConfidence: c.sentimentConfidence, content: c.content, likes: c.likes },
      topLikeThreshold
    )
  );

  let analyzed = 0;
  let failed = 0;

  // 배치 처리
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);

    for (const comment of batch) {
      const result = await analyzeWithLLM(comment.content, celebrityName);

      if (result) {
        await prisma.comment.update({
          where: { id: comment.id },
          data: {
            emotions: result.emotions,
            topics: result.topics.map((t) => `${t.topic}:${t.score}`),
            sentimentScore: result.overallScore,
            sentimentLabel: result.overallLabel,
            analysisDepth: "DEEP",
          },
        });
        analyzed++;
      } else {
        failed++;
      }
    }

    // 배치 간 대기 (GPU 과부하 방지)
    if (i + BATCH_SIZE < targets.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return { analyzed, skipped: allComments.length - targets.length, failed };
}
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/workers/analyzer/deep-analysis.test.ts
```

Expected: PASS (8/8)

- [ ] **Step 5: 커밋**

```bash
git add src/workers/analyzer/deep-analysis.ts src/workers/analyzer/deep-analysis.test.ts
git commit -m "feat: 2단계 분석 대상 필터링 및 배치 오케스트레이션

confidence/길이/좋아요 기반 필터링
- 배치 처리 (100댓글/배치, 1초 대기)
- Ollama 불가 시 graceful skip

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 워커 통합 (DEEP_ANALYSIS 큐 + 흐름 변경)

**Files:**
- Modify: `src/shared/lib/queue.ts`
- Modify: `src/workers/index.ts`

- [ ] **Step 1: queue.ts에 DEEP_ANALYSIS 큐 추가**

```typescript
// src/shared/lib/queue.ts 수정
export const QUEUE_NAMES = {
  CRAWL: "crawl",
  ANALYSIS: "analysis",
  DEEP_ANALYSIS: "deep-analysis",  // 추가
  SNAPSHOT: "snapshot",
} as const;

// 기존 큐들 아래에 추가:
export const deepAnalysisQueue = createQueue(QUEUE_NAMES.DEEP_ANALYSIS);
```

- [ ] **Step 2: workers/index.ts 수정**

분석 워커의 처리 흐름 변경:
```
기존: 1단계 분석 → 스냅샷 큐
변경: 1단계 분석 → 2단계 대상 확인 → 대상 있으면 deepAnalysisQueue 추가 → 없으면 스냅샷 큐
```

분석 워커에서 `sentimentConfidence` 업데이트 추가 (`analysisDepth: "BASIC"` 설정).

새로운 deep analysis 워커 추가:
```typescript
import { processDeepAnalysisBatch } from "./analyzer/deep-analysis";
import { deepAnalysisQueue } from "../shared/lib/queue";  // 또는 QUEUE_NAMES

const deepAnalysisWorker = new Worker(
  QUEUE_NAMES.DEEP_ANALYSIS,
  async (job) => {
    const { articleId, celebrityId, celebrityName } = job.data;
    console.log(`[DeepAnalysis] 심층 분석 시작: article=${articleId}`);

    const result = await processDeepAnalysisBatch(articleId, celebrityName);
    console.log(`[DeepAnalysis] 완료: 분석 ${result.analyzed}개, 스킵 ${result.skipped}개, 실패 ${result.failed}개`);

    await snapshotQueue.add("create-snapshot", { celebrityId });
  },
  { connection: redis, concurrency: 1 }  // GPU 보호
);
```

분석 워커 수정 (1단계 완료 후 2단계 판단):
```typescript
// analysis worker 처리 함수 내:
// 기존 1단계 분석 루프 후...

// 2단계 대상 확인
const deepTargetCount = await prisma.comment.count({
  where: {
    articleId,
    sentimentScore: { not: null },
    analysisDepth: { not: "DEEP" },
    OR: [
      { sentimentConfidence: { lt: 0.7 } },
      { sentimentConfidence: null },
    ],
  },
});

// 길이가 긴 댓글도 있을 수 있으므로 간단히 체크
const hasLongComments = comments.some((c) => c.content.length > 50);

if (deepTargetCount > 0 || hasLongComments) {
  // 셀럽 이름 조회
  const celebrity = await prisma.celebrity.findUnique({
    where: { id: celebrityId },
    select: { name: true },
  });

  await deepAnalysisQueue.add("deep-analyze", {
    articleId,
    celebrityId,
    celebrityName: celebrity?.name ?? "알 수 없음",
  });
} else {
  await snapshotQueue.add("create-snapshot", { celebrityId });
}
```

Graceful shutdown에 deepAnalysisWorker 추가.

- [ ] **Step 3: queue.test.ts 업데이트**

```typescript
// 기존 테스트에 추가:
it("DEEP_ANALYSIS 큐 이름이 정의되어 있다", () => {
  expect(QUEUE_NAMES.DEEP_ANALYSIS).toBe("deep-analysis");
});
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/shared/lib/queue.test.ts
```

- [ ] **Step 5: 커밋**

```bash
git add src/shared/lib/queue.ts src/shared/lib/queue.test.ts src/workers/index.ts
git commit -m "feat: 심층 분석 워커 통합

DEEP_ANALYSIS 큐 추가, 분석 워커 흐름 변경
- 1단계 완료 후 2단계 대상 판단 → deepAnalysisQueue
- 심층 분석 워커 (concurrency: 1, GPU 보호)
- Graceful shutdown 포함

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 환경 변수 + 최종 정리

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: .env.example 업데이트**

기존 내용 아래에 추가:
```
# Phase 2B: Ollama LLM 심층 분석
OLLAMA_URL="http://localhost:11434"
OLLAMA_MODEL="gemma2:7b"
```

- [ ] **Step 2: CLAUDE.md 업데이트**

Phase 2B 완료 반영, 분석 아키텍처 문서화.

- [ ] **Step 3: 전체 테스트 실행**

```bash
pnpm vitest run
```

모든 테스트 통과 확인.

- [ ] **Step 4: 커밋**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: Phase 2B 환경 변수 및 문서 업데이트

Ollama URL/모델 환경 변수 추가
- CLAUDE.md Phase 2B 완료 반영

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 실행 순서 요약

| Task | 내용 | 의존성 | 병렬 가능 |
|------|------|--------|----------|
| 1 | Ollama 클라이언트 + Docker Compose | 없음 | - |
| 2 | LLM 분석기 (프롬프트 + 파싱) | Task 1 | - |
| 3 | 대상 필터링 + 배치 오케스트레이션 | Task 2 | - |
| 4 | 워커 통합 (큐 + 흐름 변경) | Task 3 | - |
| 5 | 환경 변수 + 정리 | Task 4 | - |

모든 태스크가 순차 의존성이 있으므로 병렬 실행 불가.

# Phase 2B: Ollama LLM 심층 감성 분석 — 설계 문서

## 개요

기존 1단계 규칙 기반 감성 분석 위에, Ollama gemma2:7b LLM을 활용한 2단계 심층 분석을 추가한다. 복합 감정 분리, 감정 태깅, 주제별 감성 추출을 수행하여 comments 테이블의 emotions[], topics[] 필드를 채운다.

## 범위

- Ollama gemma2:7b-instruct-q4 모델 통합
- 2단계 분석 대상 필터링 (confidence, 길이, 좋아요)
- 단일 프롬프트로 감정 태깅 + 주제 추출 + 복합 감정 분리
- Docker Compose에 Ollama 서비스 추가
- DEEP_ANALYSIS BullMQ 큐 추가

## 범위 외

- 이벤트 자동 감지 (Phase 3으로 연기)
- UI 변경 (Phase 3에서 주제별 히트맵 등과 함께)
- Claude API 폴백 (Phase 2B에서는 Ollama만)

---

## 1. 아키텍처

```
분석 워커 (analysis worker)
│
├── 1단계: 규칙 기반 (기존, 변경 없음)
│   └── sentimentScore, sentimentLabel, sentimentConfidence 저장
│
└── 1단계 완료 후 대상 필터링:
    ├── 대상 아님 → 스냅샷 큐 (기존 흐름)
    └── 대상임 → DEEP_ANALYSIS 큐
                    │
                    ▼
              2단계 심층 분석 워커 (신규)
              ├── Ollama API 호출
              ├── JSON 응답 파싱
              ├── DB 업데이트 (emotions, topics, score, label, depth)
              └── 스냅샷 큐
```

### 2단계 분석 대상 필터링 기준

댓글이 아래 조건 중 하나 이상을 만족하면 2단계 대상:
1. `sentimentConfidence < 0.7` — 1단계가 확신하지 못한 댓글
2. `content.length > 50` — 길어서 복합 감정이 있을 가능성
3. 좋아요 상위 댓글 — 해당 기사 댓글 중 `likes` 기준 상위 10%

---

## 2. Ollama 클라이언트

```typescript
// src/shared/lib/ollama.ts

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system: string;
  format: "json";
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaGenerateResponse {
  model: string;
  response: string;  // JSON 문자열
  done: boolean;
}

class OllamaClient {
  constructor(private baseUrl: string = "http://localhost:11434") {}

  async generate(request: OllamaGenerateRequest): Promise<OllamaGenerateResponse>;
  async isAvailable(): Promise<boolean>;  // GET /api/tags
  async ensureModel(model: string): Promise<void>;  // POST /api/pull if not exists
}
```

**환경 변수:** `OLLAMA_URL` (기본값: `http://localhost:11434`)
**모델:** `OLLAMA_MODEL` (기본값: `gemma2:7b-instruct-q4`)

---

## 3. LLM 분석기

```typescript
// src/workers/analyzer/llm-analyzer.ts

interface DeepAnalysisResult {
  emotions: string[];
  topics: Array<{ topic: string; score: number }>;
  overallScore: number;
  overallLabel: SentimentLabel;
}

async function analyzeWithLLM(
  content: string,
  celebrityName: string
): Promise<DeepAnalysisResult | null>;
```

### 프롬프트

**시스템:**
```
당신은 한국어 댓글 감성 분석 전문가입니다.
댓글을 분석하여 반드시 아래 JSON 형식으로만 응답하세요.
```

**사용자:**
```
셀럽: {셀럽이름}
댓글: {댓글내용}

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
overallLabel: VERY_POSITIVE, POSITIVE, NEUTRAL, NEGATIVE, VERY_NEGATIVE
```

### 응답 검증

- JSON 파싱 실패 → `null` 반환
- emotions: 허용 목록에 없는 값 제거
- topics.score: -1.0~1.0 클램핑
- overallScore: -1.0~1.0 클램핑
- overallLabel: 유효한 SentimentLabel이 아니면 score 기반으로 재계산

### Ollama 요청 옵션

```json
{
  "model": "gemma2:7b-instruct-q4",
  "format": "json",
  "stream": false,
  "options": {
    "temperature": 0.1,
    "num_predict": 512
  }
}
```

- `temperature: 0.1` — 일관된 분석 결과
- `num_predict: 512` — JSON 응답에 충분한 토큰
- 타임아웃: 30초

---

## 4. 2단계 오케스트레이션

```typescript
// src/workers/analyzer/deep-analysis.ts

// 2단계 대상 여부 판단
function shouldDeepAnalyze(comment: {
  sentimentConfidence: number | null;
  content: string;
  likes: number;
}, topLikeThreshold: number): boolean;

// 기사의 댓글 중 좋아요 상위 10% 임계값 계산
function calculateTopLikeThreshold(comments: { likes: number }[]): number;

// 배치 심층 분석 실행
async function processDeepAnalysisBatch(
  articleId: string,
  celebrityName: string
): Promise<{ analyzed: number; skipped: number; failed: number }>;
```

**배치 처리:**
- 100댓글/배치
- 배치 간 1초 대기 (GPU 과부하 방지)
- Ollama 다운 시 → 전체 배치 건너뜀, 로그 기록

---

## 5. 워커 통합

### 새 큐: DEEP_ANALYSIS

```typescript
// src/shared/lib/queue.ts 수정
export const QUEUE_NAMES = {
  CRAWL: "crawl",
  ANALYSIS: "analysis",
  DEEP_ANALYSIS: "deep-analysis",  // 추가
  SNAPSHOT: "snapshot",
} as const;

export const deepAnalysisQueue = createQueue(QUEUE_NAMES.DEEP_ANALYSIS);
```

### 분석 워커 변경

```
기존 (analysis worker):
  댓글 조회 → 1단계 분석 → DB 업데이트 → 스냅샷 큐

변경:
  댓글 조회 → 1단계 분석 → DB 업데이트
  → 2단계 대상 있음? → deepAnalysisQueue.add()
  → 대상 없음? → 스냅샷 큐
```

### 심층 분석 워커 (신규)

```typescript
// workers/index.ts에 추가
const deepAnalysisWorker = new Worker(
  QUEUE_NAMES.DEEP_ANALYSIS,
  async (job) => {
    await processDeepAnalysisBatch(job.data.articleId, job.data.celebrityName);
    await snapshotQueue.add("aggregate", { celebrityId: job.data.celebrityId });
  },
  { connection: redis, concurrency: 1 }  // GPU 보호
);
```

**concurrency: 1** — GPU 메모리 경합 방지. gemma2:7b가 ~4.5GB VRAM을 사용하므로 동시 추론은 OOM 위험.

---

## 6. Docker Compose

```yaml
# docker-compose.yml에 추가
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

워커 시작 시 `OllamaClient.ensureModel("gemma2:7b-instruct-q4")` 호출하여 모델 자동 다운로드.

---

## 7. 환경 변수

```
OLLAMA_URL="http://localhost:11434"
OLLAMA_MODEL="gemma2:7b-instruct-q4"
```

Docker Compose 내부: `OLLAMA_URL="http://ollama:11434"`

---

## 8. 에러 처리

| 상황 | 대응 |
|------|------|
| Ollama 서비스 다운 | 2단계 건너뜀, 1단계 결과 유지, 로그 경고 |
| GPU OOM | 배치 사이즈 축소 (100→50→10), 재시도 |
| JSON 파싱 실패 | 1단계 결과 유지, 해당 댓글 스킵, 로그 |
| 응답 타임아웃 (30초) | 재시도 1회 후 스킵 |
| 모델 미설치 | 워커 시작 시 자동 pull |
| 감정/주제 검증 실패 | 유효하지 않은 값 제거, 나머지 저장 |

---

## 9. 파일 구조

```
src/shared/lib/
└── ollama.ts              (신규) Ollama API 클라이언트

src/shared/lib/queue.ts    (수정) DEEP_ANALYSIS 큐 추가

src/workers/analyzer/
├── sentiment.ts           (변경 없음)
├── llm-analyzer.ts        (신규) LLM 프롬프트 + 파싱
├── llm-analyzer.test.ts   (신규)
├── deep-analysis.ts       (신규) 대상 필터링 + 배치 오케스트레이션
└── deep-analysis.test.ts  (신규)

src/workers/index.ts       (수정) deep analysis 워커 추가, 분석 워커 흐름 변경

docker-compose.yml         (수정) Ollama 서비스 추가
.env.example               (수정) OLLAMA_URL, OLLAMA_MODEL 추가
```

---

## 10. 개발 순서

| Task | 내용 | 의존성 |
|------|------|--------|
| 1 | Ollama 클라이언트 + Docker Compose | 없음 |
| 2 | LLM 분석기 (프롬프트 + JSON 파싱) | Task 1 |
| 3 | 2단계 대상 필터링 + 오케스트레이션 | Task 2 |
| 4 | 워커 통합 (DEEP_ANALYSIS 큐 + 흐름 변경) | Task 3 |
| 5 | 환경 변수 + 최종 정리 | Task 4 |

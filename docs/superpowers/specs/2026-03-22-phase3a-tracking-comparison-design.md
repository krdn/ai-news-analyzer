# Phase 3A: 이벤트 감지 + 타임라인 + 셀럽 비교 — 설계 문서

## 개요

감성 스냅샷 데이터를 기반으로 이벤트(여론 급변)를 자동 감지하고, 이벤트 타임라인 페이지와 셀럽 비교 페이지를 구현한다. 셀럽 상세 페이지에 이벤트 마커와 주제별 감성 히트맵을 추가한다.

## 범위

- Prisma events 모델 + 마이그레이션
- 이벤트 자동 감지 엔진 (Z-score ±2σ, 보수적)
- 이벤트 타임라인 페이지 (/events)
- 셀럽 비교 페이지 (/compare) — 오버레이 차트 + 레이더 차트
- 셀럽 상세 페이지 확장 (이벤트 마커, 주제 히트맵)

## 범위 외

- 실시간 알림 (Phase 3B)
- 즐겨찾기/개인화 (Phase 3B)
- 사용자 인증 (Phase 4)

---

## 1. 데이터 모델

### Event 모델 (Prisma 추가)

```prisma
model Event {
  id              String    @id @default(uuid())
  celebrityId     String    @map("celebrity_id")
  title           String    @db.VarChar(300)
  description     String?
  eventDate       DateTime  @map("event_date")
  detectedAt      DateTime  @default(now()) @map("detected_at")
  sentimentBefore Float     @map("sentiment_before")
  sentimentAfter  Float     @map("sentiment_after")
  impactScore     Float     @map("impact_score")
  autoDetected    Boolean   @default(true) @map("auto_detected")

  celebrity Celebrity @relation(fields: [celebrityId], references: [id], onDelete: Cascade)

  @@index([celebrityId, eventDate])
  @@map("events")
}
```

Celebrity 모델에 `events Event[]` relation 추가.

---

## 2. 이벤트 자동 감지 엔진

### 감지 알고리즘

```
스냅샷 워커 집계 완료 후 실행:

1. 최근 24시간 시간별 스냅샷 조회 (셀럽별)
2. 이동평균 계산 (24시간 윈도우)
3. 표준편차(σ) 계산
4. 현재 avgScore가 이동평균 ± 2σ 벗어나면:
   - sentimentBefore = 이동평균
   - sentimentAfter = 현재 avgScore
   - impactScore = min(1.0, |현재 - 이동평균| / σ)
   - title = "{셀럽이름} 감성 급변 감지 ({상승/하락})"
   - events 테이블에 INSERT
5. 중복 방지: 같은 셀럽에 대해 6시간 이내 중복 이벤트 무시
```

### 전제 조건

- 24시간 이상의 스냅샷 데이터가 있어야 감지 실행
- 스냅샷이 3개 미만이면 건너뜀 (σ 계산 불가)

### 파일

```typescript
// src/workers/event-detector.ts
export async function detectSentimentAnomaly(
  celebrityId: string,
  celebrityName: string
): Promise<void>;
```

스냅샷 워커(`workers/index.ts`)에서 집계 완료 후 `detectSentimentAnomaly` 호출.

---

## 3. 이벤트 타임라인 페이지

### URL: `/events`

### 구성

- **필터 바**: 셀럽 선택 드롭다운, 기간 필터 (7일/30일/전체)
- **세로 타임라인**: 왼쪽 라인 + 색상 도트 (빨강=하락, 초록=상승)
- **이벤트 카드**: 제목, 자동 감지 라벨, 영향도, 전후 감성 비교 (화살표), 관련 기사/댓글 수 배지

### API

```
GET /api/events?celebrityId=xxx&days=30
→ { events: Event[], total: number }
```

### 위젯

- `src/widgets/event-timeline/index.tsx` — 타임라인 위젯
- `src/entities/event/model/types.ts` — Event 타입
- `src/entities/event/api/use-events.ts` — SWR 훅

---

## 4. 셀럽 비교 페이지

### URL: `/compare`

### 구성

- **셀럽 선택기**: 2~4명 선택 (검색 + 드롭다운)
- **감성 추이 오버레이 차트**: Recharts LineChart, 셀럽별 색상 구분
- **레이더 차트**: 주제별 감성 비교 (Recharts RadarChart), 주제는 Phase 2B topics 데이터에서 추출

### API

```
GET /api/compare?ids=id1,id2,id3&days=30
→ {
    celebrities: [{id, name, snapshots: SentimentDataPoint[]}],
    topics: [{celebrityId, topic, avgScore}]
  }
```

### 위젯

- `src/widgets/comparison-chart/index.tsx` — 오버레이 차트
- `src/widgets/topic-radar/index.tsx` — 레이더 차트
- `src/features/celeb-comparison/api/use-comparison.ts` — SWR 훅

---

## 5. 셀럽 상세 페이지 확장

### 추가 요소

1. **감성 차트에 이벤트 마커**
   - 기존 SentimentChart에 Recharts `ReferenceDot` 추가
   - 이벤트 발생 지점에 빨강(하락)/초록(상승) 점
   - 호버 시 이벤트 제목 + 영향도 툴팁

2. **주제별 감성 히트맵** (신규 위젯)
   - 가로 바 차트: 주제별 평균 감성 점수
   - 색상: -1(빨강) ~ 0(회색) ~ +1(초록)
   - Phase 2B의 topics 데이터 집계

### 레이아웃 변경

```
기존 (2열):  차트 | 댓글피드
변경 (2행2열):
  [감성 차트 + 이벤트 마커]  [주제별 히트맵]
  [최근 댓글 피드          ]  [최근 이벤트    ]
```

### 위젯

- `src/widgets/topic-heatmap/index.tsx` — 주제별 감성 바 차트
- `src/widgets/sentiment-chart/index.tsx` (수정) — 이벤트 마커 추가

---

## 6. 파일 구조

```
prisma/schema.prisma            (수정) Event 모델 추가

src/workers/
├── event-detector.ts           (신규) Z-score 감지 엔진
├── event-detector.test.ts      (신규)
└── index.ts                    (수정) 스냅샷 워커에 감지 호출 추가

src/entities/event/
├── model/types.ts              (신규) Event 타입
├── api/use-events.ts           (신규) SWR 훅
└── index.ts                    (신규)

src/features/celeb-comparison/
├── api/use-comparison.ts       (신규) SWR 훅
└── index.ts                    (신규)

src/widgets/
├── event-timeline/index.tsx    (신규) 타임라인 위젯
├── comparison-chart/index.tsx  (신규) 오버레이 차트
├── topic-radar/index.tsx       (신규) 레이더 차트
├── topic-heatmap/index.tsx     (신규) 주제별 바 차트
└── sentiment-chart/index.tsx   (수정) 이벤트 마커 추가

src/app/(dashboard)/
├── events/page.tsx             (신규) 이벤트 타임라인 페이지
├── compare/page.tsx            (신규) 셀럽 비교 페이지
└── celebrity/[id]/page.tsx     (수정) 히트맵 + 이벤트 추가

src/app/api/
├── events/route.ts             (신규) 이벤트 API
└── compare/route.ts            (신규) 비교 API
```

---

## 7. 개발 순서

| Task | 내용 | 의존성 | 병렬 |
|------|------|--------|------|
| 1 | Prisma events 모델 + 마이그레이션 | 없음 | - |
| 2 | 이벤트 감지 엔진 | Task 1 | - |
| 3 | 이벤트 API + 타임라인 페이지 | Task 1 | Task 4와 병렬 |
| 4 | 비교 API + 비교 페이지 | 없음 | Task 3과 병렬 |
| 5 | 셀럽 상세 페이지 확장 | Task 1 | Task 3, 4와 병렬 |
| 6 | 사이드바 업데이트 + 최종 정리 | Task 3-5 | - |

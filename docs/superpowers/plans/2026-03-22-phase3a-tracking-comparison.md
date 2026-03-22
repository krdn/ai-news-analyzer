# Phase 3A: 이벤트 감지 + 타임라인 + 셀럽 비교 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 감성 급변 이벤트를 자동 감지하고, 이벤트 타임라인 + 셀럽 비교 페이지를 구현하며, 셀럽 상세 페이지에 주제 히트맵과 이벤트 마커를 추가한다.

**Architecture:** 스냅샷 워커에 Z-score 기반 이벤트 감지 추가. events 테이블에 저장. 이벤트 타임라인과 셀럽 비교를 별도 페이지로 구현. Recharts RadarChart로 주제별 비교, ReferenceDot으로 이벤트 마커.

**Tech Stack:** Prisma, Recharts (RadarChart, ReferenceDot), SWR, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-22-phase3a-tracking-comparison-design.md`

---

## 파일 구조

```
prisma/schema.prisma                    (수정) Event 모델 추가

src/workers/
├── event-detector.ts                   (신규) Z-score 이벤트 감지
├── event-detector.test.ts              (신규)
└── index.ts                            (수정) 스냅샷 워커에 감지 호출

src/entities/event/
├── model/types.ts                      (신규) Event 타입 + Zod
├── api/use-events.ts                   (신규) SWR 훅
└── index.ts                            (신규)

src/features/celeb-comparison/
├── api/use-comparison.ts               (신규) SWR 훅
└── index.ts                            (신규)

src/widgets/
├── event-timeline/index.tsx            (신규) 세로 타임라인
├── comparison-chart/index.tsx          (신규) 오버레이 라인 차트
├── topic-radar/index.tsx               (신규) 레이더 차트
├── topic-heatmap/index.tsx             (신규) 주제별 바 차트
└── sentiment-chart/index.tsx           (수정) 이벤트 마커 추가

src/app/api/
├── events/route.ts                     (신규)
└── compare/route.ts                    (신규)

src/app/(dashboard)/
├── events/page.tsx                     (신규)
├── compare/page.tsx                    (신규)
└── celebrity/[id]/page.tsx             (수정)

src/widgets/sidebar/index.tsx           (수정) 네비게이션 추가
```

---

## Task 1: Prisma Event 모델 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/entities/event/model/types.ts`
- Create: `src/entities/event/index.ts`

- [ ] **Step 1: schema.prisma에 Event 모델 추가**

Celebrity 모델에 `events Event[]` relation 추가.

```prisma
model Event {
  id              String   @id @default(uuid())
  celebrityId     String   @map("celebrity_id")
  title           String   @db.VarChar(300)
  description     String?
  eventDate       DateTime @map("event_date")
  detectedAt      DateTime @default(now()) @map("detected_at")
  sentimentBefore Float    @map("sentiment_before")
  sentimentAfter  Float    @map("sentiment_after")
  impactScore     Float    @map("impact_score")
  autoDetected    Boolean  @default(true) @map("auto_detected")

  celebrity Celebrity @relation(fields: [celebrityId], references: [id], onDelete: Cascade)

  @@index([celebrityId, eventDate])
  @@map("events")
}
```

- [ ] **Step 2: 마이그레이션 실행**

```bash
pnpm prisma migrate dev --name add-events
```

- [ ] **Step 3: Event 엔티티 타입 생성**

```typescript
// src/entities/event/model/types.ts
import type { Event } from "@prisma/client";
export type { Event };

export interface EventWithRelations extends Event {
  celebrity?: { name: string };
}
```

```typescript
// src/entities/event/index.ts
export type { Event, EventWithRelations } from "./model/types";
```

- [ ] **Step 4: 커밋**

```bash
git add prisma/ src/entities/event/
git commit -m "feat: Event 모델 추가 (Prisma 마이그레이션)

이벤트 자동 감지를 위한 events 테이블
- Z-score 기반 감성 급변 기록
- sentimentBefore/After, impactScore

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 이벤트 자동 감지 엔진

**Files:**
- Create: `src/workers/event-detector.ts`
- Create: `src/workers/event-detector.test.ts`
- Modify: `src/workers/index.ts`

- [ ] **Step 1: 감지 엔진 테스트 작성**

```typescript
// src/workers/event-detector.test.ts
import { describe, it, expect } from "vitest";
import { calculateZScore, isAnomaly, generateEventTitle } from "./event-detector";

describe("이벤트 감지 엔진", () => {
  it("Z-score를 계산한다", () => {
    const scores = [0.3, 0.35, 0.28, 0.32, 0.31, 0.29, 0.33, 0.30];
    const result = calculateZScore(scores, -0.2);
    expect(result.mean).toBeCloseTo(0.31, 1);
    expect(result.stdDev).toBeGreaterThan(0);
    expect(result.zScore).toBeLessThan(-2); // -0.2 is far below mean of ~0.31
  });

  it("표준편차가 0이면 Z-score는 0이다", () => {
    const scores = [0.5, 0.5, 0.5, 0.5];
    const result = calculateZScore(scores, 0.5);
    expect(result.zScore).toBe(0);
  });

  it("±2σ 초과이면 이상치로 판단한다", () => {
    expect(isAnomaly(2.5)).toBe(true);
    expect(isAnomaly(-2.1)).toBe(true);
    expect(isAnomaly(1.5)).toBe(false);
    expect(isAnomaly(-1.8)).toBe(false);
  });

  it("상승 이벤트 제목을 생성한다", () => {
    const title = generateEventTitle("홍길동", 0.5);
    expect(title).toContain("홍길동");
    expect(title).toContain("상승");
  });

  it("하락 이벤트 제목을 생성한다", () => {
    const title = generateEventTitle("홍길동", -0.5);
    expect(title).toContain("홍길동");
    expect(title).toContain("하락");
  });

  it("데이터가 부족하면 감지하지 않는다", () => {
    const scores = [0.3, 0.4]; // 3개 미만
    const result = calculateZScore(scores, 0.5);
    expect(result.stdDev).toBe(0); // 계산 불가 시 0
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패**

```bash
pnpm vitest run src/workers/event-detector.test.ts
```

- [ ] **Step 3: 감지 엔진 구현**

```typescript
// src/workers/event-detector.ts

interface ZScoreResult {
  mean: number;
  stdDev: number;
  zScore: number;
}

export function calculateZScore(historicalScores: number[], currentScore: number): ZScoreResult {
  if (historicalScores.length < 3) {
    return { mean: currentScore, stdDev: 0, zScore: 0 };
  }

  const mean = historicalScores.reduce((a, b) => a + b, 0) / historicalScores.length;
  const variance = historicalScores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / historicalScores.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) return { mean, stdDev: 0, zScore: 0 };

  const zScore = (currentScore - mean) / stdDev;
  return { mean, stdDev, zScore };
}

export function isAnomaly(zScore: number, threshold: number = 2): boolean {
  return Math.abs(zScore) > threshold;
}

export function generateEventTitle(celebrityName: string, scoreDiff: number): string {
  const direction = scoreDiff > 0 ? "상승" : "하락";
  return `${celebrityName} 감성 급변 감지 (${direction})`;
}

export async function detectSentimentAnomaly(
  celebrityId: string,
  celebrityName: string
): Promise<void> {
  const { prisma } = await import("@/shared/lib/prisma");

  // 최근 24시간 시간별 스냅샷 조회
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const snapshots = await prisma.sentimentSnapshot.findMany({
    where: {
      celebrityId,
      periodType: "HOURLY",
      periodStart: { gte: since },
    },
    orderBy: { periodStart: "asc" },
    select: { avgScore: true, periodStart: true },
  });

  if (snapshots.length < 3) return; // 데이터 부족

  const historicalScores = snapshots.slice(0, -1).map((s) => s.avgScore);
  const currentScore = snapshots[snapshots.length - 1].avgScore;

  const { mean, zScore } = calculateZScore(historicalScores, currentScore);

  if (!isAnomaly(zScore)) return;

  // 6시간 이내 중복 방지
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const recentEvent = await prisma.event.findFirst({
    where: {
      celebrityId,
      detectedAt: { gte: sixHoursAgo },
    },
  });

  if (recentEvent) return;

  const impactScore = Math.min(1.0, Math.abs(currentScore - mean) / (Math.abs(zScore) > 0 ? Math.abs(currentScore - mean) / Math.abs(zScore) : 1));

  await prisma.event.create({
    data: {
      celebrityId,
      title: generateEventTitle(celebrityName, currentScore - mean),
      eventDate: new Date(),
      sentimentBefore: mean,
      sentimentAfter: currentScore,
      impactScore: Math.min(1.0, Math.abs(zScore) / 4), // 정규화: z=4 → impact=1.0
      autoDetected: true,
    },
  });

  console.log(`[EventDetector] 이벤트 감지: ${celebrityName} (z=${zScore.toFixed(2)})`);
}
```

- [ ] **Step 4: 테스트 실행 → 성공 (6/6)**

- [ ] **Step 5: workers/index.ts에 감지 호출 추가**

스냅샷 워커의 upsert 완료 후에 추가:
```typescript
import { detectSentimentAnomaly } from "./event-detector";

// 스냅샷 upsert 후:
const celebrity = await prisma.celebrity.findUnique({
  where: { id: celebrityId },
  select: { name: true },
});
if (celebrity) {
  await detectSentimentAnomaly(celebrityId, celebrity.name);
}
```

- [ ] **Step 6: 커밋**

```bash
git add src/workers/event-detector.ts src/workers/event-detector.test.ts src/workers/index.ts
git commit -m "feat: 이벤트 자동 감지 엔진

Z-score ±2σ 기반 감성 급변 감지
- 24시간 이동평균 대비 이상치 탐지
- 6시간 이내 중복 방지
- 스냅샷 워커에서 자동 호출

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 이벤트 API + 타임라인 페이지

**Files:**
- Create: `src/app/api/events/route.ts`
- Create: `src/entities/event/api/use-events.ts`
- Create: `src/widgets/event-timeline/index.tsx`
- Create: `src/app/(dashboard)/events/page.tsx`

- [ ] **Step 1: 이벤트 API 구현**

```typescript
// src/app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const celebrityId = searchParams.get("celebrityId");
  const days = parseInt(searchParams.get("days") ?? "30");

  const since = new Date();
  since.setDate(since.getDate() - days);

  const where: Record<string, unknown> = { eventDate: { gte: since } };
  if (celebrityId) where.celebrityId = celebrityId;

  const events = await prisma.event.findMany({
    where,
    orderBy: { eventDate: "desc" },
    include: { celebrity: { select: { name: true, category: true } } },
  });

  return NextResponse.json({ events, total: events.length });
}
```

- [ ] **Step 2: SWR 훅 구현**

```typescript
// src/entities/event/api/use-events.ts
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useEvents(celebrityId?: string, days = 30) {
  const params = new URLSearchParams({ days: String(days) });
  if (celebrityId) params.set("celebrityId", celebrityId);
  return useSWR(`/api/events?${params}`, fetcher, { refreshInterval: 60000 });
}
```

`src/entities/event/index.ts` 업데이트하여 export 추가.

- [ ] **Step 3: 이벤트 타임라인 위젯 구현**

```tsx
// src/widgets/event-timeline/index.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TimelineEvent {
  id: string;
  title: string;
  eventDate: string;
  sentimentBefore: number;
  sentimentAfter: number;
  impactScore: number;
  autoDetected: boolean;
  celebrity?: { name: string; category: string };
}

interface EventTimelineProps {
  events: TimelineEvent[];
}

export function EventTimeline({ events }: EventTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        감지된 이벤트가 없습니다
      </div>
    );
  }

  return (
    <div className="relative border-l-2 border-zinc-700 ml-4 pl-6 space-y-6">
      {events.map((event) => {
        const isNegative = event.sentimentAfter < event.sentimentBefore;
        const dotColor = isNegative ? "bg-red-500" : "bg-green-500";
        const afterColor = isNegative ? "text-red-400" : "text-green-400";

        return (
          <div key={event.id} className="relative">
            <div className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full ${dotColor} border-2 border-zinc-950`} />
            <div className="text-xs text-zinc-500 mb-1">
              {new Date(event.eventDate).toLocaleString("ko-KR")}
            </div>
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-sm text-zinc-100">{event.title}</div>
                    <div className="flex gap-2 mt-1">
                      {event.autoDetected && (
                        <Badge variant="secondary" className="text-xs">자동 감지</Badge>
                      )}
                      <span className="text-xs text-zinc-500">
                        영향도 {(event.impactScore * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-center">
                      <div className="text-[10px] text-zinc-500">이전</div>
                      <div className="text-sm font-bold text-zinc-300">
                        {event.sentimentBefore >= 0 ? "+" : ""}{event.sentimentBefore.toFixed(2)}
                      </div>
                    </div>
                    <span className="text-zinc-600">→</span>
                    <div className="text-center">
                      <div className="text-[10px] text-zinc-500">이후</div>
                      <div className={`text-sm font-bold ${afterColor}`}>
                        {event.sentimentAfter >= 0 ? "+" : ""}{event.sentimentAfter.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 이벤트 타임라인 페이지 구현**

```tsx
// src/app/(dashboard)/events/page.tsx
"use client";

import { useState } from "react";
import { useEvents } from "@/entities/event/api/use-events";
import { useCelebrities } from "@/entities/celebrity/api/use-celebrities";
import { EventTimeline } from "@/widgets/event-timeline";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function EventsPage() {
  const [celebrityId, setCelebrityId] = useState<string>("");
  const [days, setDays] = useState(30);
  const { data: celebrities } = useCelebrities();
  const { data } = useEvents(celebrityId || undefined, days);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-zinc-100">이벤트 타임라인</h2>

      <div className="flex gap-3">
        <Select value={celebrityId} onValueChange={setCelebrityId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="전체 셀럽" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">전체</SelectItem>
            {celebrities?.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded text-xs ${
                days === d ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      <EventTimeline events={data?.events ?? []} />
    </div>
  );
}
```

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/events/ src/entities/event/ src/widgets/event-timeline/ src/app/\(dashboard\)/events/
git commit -m "feat: 이벤트 API 및 타임라인 페이지

이벤트 조회 API + 세로 타임라인 UI
- 셀럽/기간 필터, 감성 전후 비교
- SWR 60초 자동 갱신

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 비교 API + 셀럽 비교 페이지

**Files:**
- Create: `src/app/api/compare/route.ts`
- Create: `src/features/celeb-comparison/api/use-comparison.ts`
- Create: `src/features/celeb-comparison/index.ts`
- Create: `src/widgets/comparison-chart/index.tsx`
- Create: `src/widgets/topic-radar/index.tsx`
- Create: `src/app/(dashboard)/compare/page.tsx`

- [ ] **Step 1: 비교 API 구현**

```typescript
// src/app/api/compare/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids")?.split(",") ?? [];
  const days = parseInt(searchParams.get("days") ?? "30");

  if (ids.length < 2) {
    return NextResponse.json({ error: "최소 2명의 셀럽 ID가 필요합니다" }, { status: 400 });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const celebrities = await Promise.all(
    ids.map(async (id) => {
      const celebrity = await prisma.celebrity.findUnique({
        where: { id },
        select: { id: true, name: true, category: true },
      });

      const snapshots = await prisma.sentimentSnapshot.findMany({
        where: { celebrityId: id, periodType: "DAILY", periodStart: { gte: since } },
        orderBy: { periodStart: "asc" },
      });

      return { ...celebrity, snapshots };
    })
  );

  // 주제별 감성 집계 (comments.topics에서)
  const topics = await Promise.all(
    ids.map(async (id) => {
      const comments = await prisma.comment.findMany({
        where: {
          article: { celebrityId: id },
          analysisDepth: "DEEP",
          topics: { isEmpty: false },
        },
        select: { topics: true, sentimentScore: true },
      });

      // topics는 "주제:점수" 형태의 문자열 배열
      const topicScores: Record<string, { total: number; count: number }> = {};
      for (const comment of comments) {
        for (const topicStr of comment.topics) {
          const [topic, scoreStr] = topicStr.split(":");
          if (topic && scoreStr) {
            if (!topicScores[topic]) topicScores[topic] = { total: 0, count: 0 };
            topicScores[topic].total += parseFloat(scoreStr);
            topicScores[topic].count++;
          }
        }
      }

      return {
        celebrityId: id,
        topics: Object.entries(topicScores).map(([topic, { total, count }]) => ({
          topic,
          avgScore: total / count,
        })),
      };
    })
  );

  return NextResponse.json({ celebrities, topics });
}
```

- [ ] **Step 2: SWR 훅 구현**

```typescript
// src/features/celeb-comparison/api/use-comparison.ts
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useComparison(ids: string[], days = 30) {
  const params = ids.length >= 2 ? `?ids=${ids.join(",")}&days=${days}` : null;
  return useSWR(params ? `/api/compare${params}` : null, fetcher);
}
```

```typescript
// src/features/celeb-comparison/index.ts
export { useComparison } from "./api/use-comparison";
```

- [ ] **Step 3: 오버레이 차트 위젯 구현**

```tsx
// src/widgets/comparison-chart/index.tsx
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7"];

interface ComparisonData {
  id: string;
  name: string;
  snapshots: Array<{ periodStart: string; avgScore: number }>;
}

interface ComparisonChartProps {
  celebrities: ComparisonData[];
}

export function ComparisonChart({ celebrities }: ComparisonChartProps) {
  // 모든 날짜를 합쳐서 차트 데이터 생성
  const allDates = new Set<string>();
  for (const celeb of celebrities) {
    for (const s of celeb.snapshots) {
      allDates.add(new Date(s.periodStart).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }));
    }
  }

  const chartData = Array.from(allDates).sort().map((date) => {
    const point: Record<string, unknown> = { date };
    for (const celeb of celebrities) {
      const snapshot = celeb.snapshots.find(
        (s) => new Date(s.periodStart).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) === date
      );
      point[celeb.id] = snapshot?.avgScore ?? null;
    }
    return point;
  });

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">감성 추이 비교</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis dataKey="date" stroke="#71717a" fontSize={12} />
            <YAxis domain={[-1, 1]} stroke="#71717a" fontSize={12} />
            <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
            <ReferenceLine y={0} stroke="#3f3f46" />
            {celebrities.map((celeb, i) => (
              <Line key={celeb.id} type="monotone" dataKey={celeb.id} stroke={COLORS[i]} strokeWidth={2} dot={false} name={celeb.name} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: 레이더 차트 위젯 구현**

```tsx
// src/widgets/topic-radar/index.tsx
"use client";

import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7"];

interface TopicData {
  celebrityId: string;
  topics: Array<{ topic: string; avgScore: number }>;
}

interface TopicRadarProps {
  topicData: TopicData[];
  celebrityNames: Record<string, string>;
}

export function TopicRadar({ topicData, celebrityNames }: TopicRadarProps) {
  // 모든 주제 수집
  const allTopics = new Set<string>();
  for (const td of topicData) {
    for (const t of td.topics) allTopics.add(t.topic);
  }

  // 레이더 데이터 변환 (score를 0~1로 정규화: -1→0, 0→0.5, 1→1)
  const radarData = Array.from(allTopics).map((topic) => {
    const point: Record<string, unknown> = { topic };
    for (const td of topicData) {
      const found = td.topics.find((t) => t.topic === topic);
      point[td.celebrityId] = found ? (found.avgScore + 1) / 2 : 0.5;
    }
    return point;
  });

  if (radarData.length === 0) {
    return <div className="text-center py-8 text-zinc-500">주제 데이터가 없습니다</div>;
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader><CardTitle className="text-base">주제별 감성 비교</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="#27272a" />
            <PolarAngleAxis dataKey="topic" stroke="#71717a" fontSize={12} />
            <PolarRadiusAxis domain={[0, 1]} tick={false} />
            {topicData.map((td, i) => (
              <Radar key={td.celebrityId} name={celebrityNames[td.celebrityId] ?? td.celebrityId} dataKey={td.celebrityId} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.15} />
            ))}
            <Legend />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: 비교 페이지 구현**

```tsx
// src/app/(dashboard)/compare/page.tsx
"use client";

import { useState } from "react";
import { useCelebrities } from "@/entities/celebrity/api/use-celebrities";
import { useComparison } from "@/features/celeb-comparison";
import { ComparisonChart } from "@/widgets/comparison-chart";
import { TopicRadar } from "@/widgets/topic-radar";
import { Badge } from "@/components/ui/badge";

export default function ComparePage() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { data: celebrities } = useCelebrities();
  const { data: comparison } = useComparison(selectedIds);

  function toggleCelebrity(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  }

  const nameMap = Object.fromEntries(
    (celebrities ?? []).map((c: any) => [c.id, c.name])
  );

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-zinc-100">셀럽 비교</h2>

      <div className="flex flex-wrap gap-2">
        {celebrities?.map((celeb: any) => {
          const isSelected = selectedIds.includes(celeb.id);
          return (
            <button
              key={celeb.id}
              onClick={() => toggleCelebrity(celeb.id)}
              className={`px-3 py-1.5 rounded-full text-sm transition-colors ${
                isSelected
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {celeb.name}
            </button>
          );
        })}
        <span className="text-xs text-zinc-500 self-center ml-2">
          {selectedIds.length}/4 선택됨
        </span>
      </div>

      {selectedIds.length >= 2 && comparison ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ComparisonChart celebrities={comparison.celebrities ?? []} />
          <TopicRadar
            topicData={comparison.topics ?? []}
            celebrityNames={nameMap}
          />
        </div>
      ) : (
        <div className="text-center py-12 text-zinc-500">
          비교할 셀럽을 2명 이상 선택하세요
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/compare/ src/features/celeb-comparison/ src/widgets/comparison-chart/ src/widgets/topic-radar/ src/app/\(dashboard\)/compare/
git commit -m "feat: 셀럽 비교 페이지

감성 추이 오버레이 차트 + 주제별 레이더 차트
- 2~4명 셀럽 선택 비교
- 비교 API (스냅샷 + topics 집계)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 셀럽 상세 페이지 확장

**Files:**
- Create: `src/widgets/topic-heatmap/index.tsx`
- Modify: `src/widgets/sentiment-chart/index.tsx`
- Modify: `src/app/(dashboard)/celebrity/[id]/page.tsx`

- [ ] **Step 1: 주제별 히트맵 위젯 구현**

```tsx
// src/widgets/topic-heatmap/index.tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TopicScore {
  topic: string;
  avgScore: number;
}

interface TopicHeatmapProps {
  topics: TopicScore[];
}

function scoreToColor(score: number): string {
  if (score >= 0.4) return "#22c55e";
  if (score >= 0.1) return "#86efac";
  if (score > -0.1) return "#a1a1aa";
  if (score > -0.4) return "#fca5a5";
  return "#ef4444";
}

export function TopicHeatmap({ topics }: TopicHeatmapProps) {
  if (topics.length === 0) {
    return null;
  }

  const sorted = [...topics].sort((a, b) => b.avgScore - a.avgScore);

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-base">주제별 감성</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sorted.map((t) => {
          const color = scoreToColor(t.avgScore);
          const width = Math.abs(t.avgScore) * 100;
          const isPositive = t.avgScore >= 0;

          return (
            <div key={t.topic} className="flex items-center gap-3">
              <span className="w-16 text-xs text-zinc-400 shrink-0">{t.topic}</span>
              <div className="flex-1 h-5 bg-zinc-800 rounded relative overflow-hidden">
                <div
                  className="absolute top-0 h-full rounded"
                  style={{
                    backgroundColor: color,
                    width: `${width}%`,
                    left: isPositive ? "50%" : `${50 - width}%`,
                  }}
                />
                <div className="absolute top-0 left-1/2 h-full w-px bg-zinc-600" />
              </div>
              <span className="w-12 text-xs text-right" style={{ color }}>
                {t.avgScore >= 0 ? "+" : ""}{t.avgScore.toFixed(2)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 감성 차트에 이벤트 마커 추가**

기존 `src/widgets/sentiment-chart/index.tsx`를 수정:
- props에 `events?: Array<{ periodStart: string; title: string; impactScore: number }>` 추가
- Recharts `ReferenceDot`으로 이벤트 마커 표시
- 빨강(하락)/초록(상승) 색상, 호버 시 제목 표시

- [ ] **Step 3: 셀럽 상세 페이지 업데이트**

`src/app/(dashboard)/celebrity/[id]/page.tsx`를 수정:
- useEvents 훅 추가로 해당 셀럽의 이벤트 조회
- 감성 차트에 events 전달
- 주제 히트맵 위젯 추가 (topics 데이터 집계)
- 레이아웃: 2행2열 그리드

- [ ] **Step 4: 커밋**

```bash
git add src/widgets/topic-heatmap/ src/widgets/sentiment-chart/ src/app/\(dashboard\)/celebrity/
git commit -m "feat: 셀럽 상세 페이지 확장

주제별 감성 히트맵 + 감성 차트 이벤트 마커
- Phase 2B topics 데이터 시각화
- 이벤트 발생 지점 차트에 표시

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 사이드바 업데이트 + 최종 정리

**Files:**
- Modify: `src/widgets/sidebar/index.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 사이드바에 네비게이션 추가**

`src/widgets/sidebar/index.tsx`의 `NAV_ITEMS`에 추가:
```typescript
import { BarChart3, Settings, Users, Clock, GitCompare } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: BarChart3 },
  { href: "/events", label: "이벤트 타임라인", icon: Clock },
  { href: "/compare", label: "셀럽 비교", icon: GitCompare },
  { href: "/admin", label: "셀럽 관리", icon: Users },
  { href: "/admin/crawler", label: "크롤러 상태", icon: Settings },
];
```

- [ ] **Step 2: CLAUDE.md 업데이트**

Phase 3A 완료 반영.

- [ ] **Step 3: 커밋**

```bash
git add src/widgets/sidebar/ CLAUDE.md
git commit -m "feat: 사이드바 네비게이션 업데이트 및 Phase 3A 완료

이벤트 타임라인, 셀럽 비교 메뉴 추가
- Phase 3A 완료 반영

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 실행 순서 요약

| Task | 내용 | 의존성 | 병렬 |
|------|------|--------|------|
| 1 | Prisma Event 모델 + 마이그레이션 | 없음 | - |
| 2 | 이벤트 감지 엔진 | Task 1 | - |
| 3 | 이벤트 API + 타임라인 페이지 | Task 1 | Task 4, 5와 병렬 |
| 4 | 비교 API + 비교 페이지 | 없음 | Task 3, 5와 병렬 |
| 5 | 셀럽 상세 페이지 확장 | Task 1 | Task 3, 4와 병렬 |
| 6 | 사이드바 + 정리 | Task 3-5 | - |

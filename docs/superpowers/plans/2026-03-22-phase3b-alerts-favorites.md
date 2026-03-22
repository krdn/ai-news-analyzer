# Phase 3B: 알림 + 즐겨찾기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이벤트 감지 시 Telegram 알림을 발송하고, 앱 전역 즐겨찾기로 셀럽을 관리한다.

**Architecture:** 이벤트 감지 시 ALERT BullMQ 큐에 잡을 추가하고, 알림 워커가 Telegram Bot API로 메시지를 발송한다. 즐겨찾기는 AppSetting key-value 모델로 관리.

**Tech Stack:** Telegram Bot API (axios), BullMQ, Prisma

**Spec:** `docs/superpowers/specs/2026-03-22-phase3b-alerts-favorites-design.md`

---

## Task 1: Prisma Alert + AppSetting 모델

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Alert + AppSetting 모델 추가**

Celebrity 모델에 `alerts Alert[]` relation 추가.

```prisma
model Alert {
  id              String    @id @default(uuid()) @db.Uuid
  celebrityId     String    @map("celebrity_id") @db.Uuid
  alertType       String    @map("alert_type")
  threshold       Float     @default(0.3)
  channel         String    @default("telegram")
  channelConfig   Json      @map("channel_config")
  enabled         Boolean   @default(true)
  lastTriggeredAt DateTime? @map("last_triggered_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  celebrity Celebrity @relation(fields: [celebrityId], references: [id], onDelete: Cascade)

  @@index([celebrityId])
  @@map("alerts")
}

model AppSetting {
  key   String @id
  value Json

  @@map("app_settings")
}
```

- [ ] **Step 2: 마이그레이션**

```bash
pnpm prisma migrate dev --name add-alerts-settings
```

- [ ] **Step 3: 커밋**

```bash
git add prisma/
git commit -m "feat: Alert + AppSetting 모델 추가

Telegram 알림 규칙 + 앱 전역 설정 테이블

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Telegram 알림 발송기

**Files:**
- Create: `src/workers/notifier/telegram.ts`
- Create: `src/workers/notifier/telegram.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/workers/notifier/telegram.test.ts
import { describe, it, expect } from "vitest";
import { formatEventAlert } from "./telegram";

describe("Telegram 알림", () => {
  it("하락 이벤트 메시지를 포맷한다", () => {
    const msg = formatEventAlert({
      title: "홍길동 감성 급변 감지 (하락)",
      sentimentBefore: 0.42,
      sentimentAfter: -0.31,
      impactScore: 0.85,
      eventDate: "2026-03-22T14:00:00Z",
    }, "홍길동");
    expect(msg).toContain("🔴");
    expect(msg).toContain("홍길동");
    expect(msg).toContain("하락");
    expect(msg).toContain("+0.42");
    expect(msg).toContain("-0.31");
    expect(msg).toContain("85%");
  });

  it("상승 이벤트는 초록 이모지를 사용한다", () => {
    const msg = formatEventAlert({
      title: "김영희 감성 급변 감지 (상승)",
      sentimentBefore: 0.05,
      sentimentAfter: 0.67,
      impactScore: 0.62,
      eventDate: "2026-03-22T09:00:00Z",
    }, "김영희");
    expect(msg).toContain("🟢");
    expect(msg).toContain("상승");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패**

- [ ] **Step 3: 구현**

```typescript
// src/workers/notifier/telegram.ts
import axios from "axios";

interface EventForAlert {
  title: string;
  sentimentBefore: number;
  sentimentAfter: number;
  impactScore: number;
  eventDate: string;
}

export function formatEventAlert(event: EventForAlert, celebrityName: string): string {
  const isDropped = event.sentimentAfter < event.sentimentBefore;
  const emoji = isDropped ? "🔴" : "🟢";
  const direction = isDropped ? "하락" : "상승";
  const before = event.sentimentBefore >= 0 ? `+${event.sentimentBefore.toFixed(2)}` : event.sentimentBefore.toFixed(2);
  const after = event.sentimentAfter >= 0 ? `+${event.sentimentAfter.toFixed(2)}` : event.sentimentAfter.toFixed(2);
  const impact = (event.impactScore * 100).toFixed(0);
  const time = new Date(event.eventDate).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

  return `${emoji} 감성 급변 감지
셀럽: ${celebrityName}
방향: ${direction} (${before} → ${after})
영향도: ${impact}%
시간: ${time}`;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<boolean> {
  try {
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    });
    return true;
  } catch (err) {
    console.error("[Telegram] 발송 실패:", (err as Error).message);
    return false;
  }
}
```

- [ ] **Step 4: 테스트 실행 → 성공 (2/2)**

- [ ] **Step 5: 커밋**

```bash
git add src/workers/notifier/
git commit -m "feat: Telegram 알림 발송기

이벤트 알림 메시지 포맷 + Bot API 발송
- 상승/하락 이모지 구분

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: 알림 워커 + 이벤트 감지 연동

**Files:**
- Modify: `src/shared/lib/queue.ts`
- Modify: `src/workers/event-detector.ts`
- Modify: `src/workers/index.ts`

- [ ] **Step 1: ALERT 큐 추가**

queue.ts에:
```typescript
ALERT: "alert"
export const alertQueue = createQueue(QUEUE_NAMES.ALERT);
```

- [ ] **Step 2: event-detector.ts 수정**

`detectSentimentAnomaly` 내부에서 `prisma.event.create()` 결과의 id를 받아 alertQueue에 추가:

```typescript
const event = await prisma.event.create({ data: { ... } });
const { alertQueue } = await import("@/shared/lib/queue");
await alertQueue.add("process-alert", {
  eventId: event.id,
  celebrityId,
  celebrityName,
});
```

- [ ] **Step 3: workers/index.ts에 알림 워커 추가**

```typescript
import { formatEventAlert, sendTelegramMessage } from "./notifier/telegram";

const alertWorker = new Worker(
  QUEUE_NAMES.ALERT,
  async (job) => {
    const { eventId, celebrityId, celebrityName } = job.data;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) return;

    const alerts = await prisma.alert.findMany({
      where: { celebrityId, enabled: true },
    });

    for (const alert of alerts) {
      // 방향 체크
      const isDropped = event.sentimentAfter < event.sentimentBefore;
      if (alert.alertType === "sentiment_drop" && !isDropped) continue;
      if (alert.alertType === "sentiment_spike" && isDropped) continue;

      // 임계값 체크
      if (event.impactScore < alert.threshold) continue;

      // Telegram 발송
      if (alert.channel === "telegram") {
        const config = alert.channelConfig as { chatId: string };
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        if (botToken && config.chatId) {
          const message = formatEventAlert(event, celebrityName);
          await sendTelegramMessage(botToken, config.chatId, message);
        }
      }

      // 마지막 발동 시간 업데이트
      await prisma.alert.update({
        where: { id: alert.id },
        data: { lastTriggeredAt: new Date() },
      });
    }
  },
  { connection: redis, concurrency: 1 }
);
```

에러 핸들러 + graceful shutdown에 alertWorker 추가.

- [ ] **Step 4: 커밋**

```bash
git add src/shared/lib/queue.ts src/workers/event-detector.ts src/workers/index.ts
git commit -m "feat: 알림 워커 통합

ALERT 큐 + 이벤트 감지 시 알림 트리거
- 방향(상승/하락) + 임계값 기반 필터링
- Telegram 발송 + lastTriggeredAt 업데이트

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 알림 설정 API + 관리자 UI

**Files:**
- Create: `src/app/api/alerts/route.ts`
- Create: `src/app/api/alerts/[id]/route.ts`
- Create: `src/app/(dashboard)/admin/alerts/page.tsx`

- [ ] **Step 1: 알림 CRUD API**

GET (목록, ?celebrityId 필터), POST (생성)
PUT (수정), DELETE (삭제)

- [ ] **Step 2: 알림 설정 페이지**

셀럽별 알림 규칙 목록, 추가 다이얼로그 (타입 선택, 임계값, chat ID), 토글, 마지막 발동 시간.

- [ ] **Step 3: 사이드바에 알림 설정 메뉴 추가**

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/alerts/ src/app/\(dashboard\)/admin/alerts/ src/widgets/sidebar/
git commit -m "feat: 알림 설정 API 및 관리자 UI

알림 규칙 CRUD + 관리 페이지
- 셀럽별 알림 규칙 관리

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 즐겨찾기 + 최종 정리

**Files:**
- Create: `src/app/api/settings/favorites/route.ts`
- Modify: `src/app/(dashboard)/page.tsx`
- Modify: `src/entities/celebrity/ui/celebrity-card.tsx`
- Modify: `src/widgets/sidebar/index.tsx`
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 즐겨찾기 API**

```typescript
// GET: 즐겨찾기 ID 목록 조회
// POST: { celebrityId, action: "add" | "remove" }
// AppSetting key="favorite_celebrities" 사용
```

- [ ] **Step 2: 대시보드에 즐겨찾기 섹션**

즐겨찾기 셀럽을 상단에 별도 표시.

- [ ] **Step 3: 셀럽 카드에 ⭐ 토글**

- [ ] **Step 4: .env.example + CLAUDE.md 업데이트**

```
TELEGRAM_BOT_TOKEN=""
```

Phase 3B 완료 반영.

- [ ] **Step 5: 커밋**

```bash
git add .
git commit -m "feat: 즐겨찾기 기능 및 Phase 3B 완료

앱 전역 즐겨찾기 + 대시보드 우선 표시
- Phase 3B 완료 반영

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 실행 순서

| Task | 내용 | 의존성 | 병렬 |
|------|------|--------|------|
| 1 | Prisma Alert + AppSetting | 없음 | - |
| 2 | Telegram 알림 발송기 | Task 1 | - |
| 3 | 알림 워커 + 이벤트 연동 | Task 2 | - |
| 4 | 알림 설정 API + UI | Task 1 | Task 5와 병렬 |
| 5 | 즐겨찾기 + 정리 | Task 1 | Task 4와 병렬 |

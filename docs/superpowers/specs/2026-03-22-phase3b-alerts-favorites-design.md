# Phase 3B: 알림 + 즐겨찾기 — 설계 문서

## 개요

이벤트 감지 시 Telegram 알림을 발송하고, 앱 전역 즐겨찾기로 셀럽을 관리한다.

## 범위

- Telegram Bot API 알림 발송
- Alert 모델 (알림 규칙 설정)
- 알림 워커 (ALERT BullMQ 큐)
- 이벤트 감지 → 알림 연동
- 알림 설정 API + 관리자 UI
- AppSetting 모델 (앱 전역 설정)
- 즐겨찾기 기능 (대시보드 우선 표시, 사이드바)

## 범위 외

- 이메일 알림 (나중에 추가 가능)
- 사용자 인증 (Phase 4)
- Webhook 연동

---

## 1. 데이터 모델

### Alert 모델

```prisma
model Alert {
  id              String   @id @default(uuid()) @db.Uuid
  celebrityId     String   @map("celebrity_id") @db.Uuid
  alertType       String   @map("alert_type")
  threshold       Float    @default(0.3)
  channel         String   @default("telegram")
  channelConfig   Json     @map("channel_config")
  enabled         Boolean  @default(true)
  lastTriggeredAt DateTime? @map("last_triggered_at")
  createdAt       DateTime @default(now()) @map("created_at")

  celebrity Celebrity @relation(fields: [celebrityId], references: [id], onDelete: Cascade)

  @@index([celebrityId])
  @@map("alerts")
}
```

alertType 값: `sentiment_drop`, `sentiment_spike`
- `sentiment_drop`: `sentimentAfter < sentimentBefore` (하락) 시 트리거
- `sentiment_spike`: `sentimentAfter > sentimentBefore` (상승) 시 트리거
- 두 타입 모두 `impactScore >= threshold` 조건 충족 필요
channelConfig: `{ "chatId": "123456789" }` (Telegram chat ID)

Celebrity 모델에 `alerts Alert[]` relation 추가.

### AppSetting 모델

```prisma
model AppSetting {
  key   String @id
  value Json

  @@map("app_settings")
}
```

즐겨찾기 저장: `key = "favorite_celebrities"`, `value = ["id1", "id2"]`

---

## 2. Telegram 알림 발송기

```typescript
// src/workers/notifier/telegram.ts

class TelegramNotifier {
  constructor(private botToken: string) {}

  async sendMessage(chatId: string, text: string): Promise<boolean>;
  formatEventAlert(event: Event, celebrity: { name: string }): string;
}
```

**환경 변수:** `TELEGRAM_BOT_TOKEN`

**메시지 포맷:**
```
🔴 감성 급변 감지
셀럽: 홍길동
방향: 하락 (+0.42 → -0.31)
영향도: 85%
시간: 2026-03-22 14:00
```

상승은 🟢, 하락은 🔴 이모지.

---

## 3. 알림 워커

### ALERT 큐

```typescript
QUEUE_NAMES.ALERT = "alert"
```

### 워커 흐름

```
이벤트 감지 (event-detector.ts)
  → 이벤트 생성 후 생성된 event.id를 받아 alertQueue.add({ eventId: event.id, celebrityId })
  → detectSentimentAnomaly 내부에서 prisma.event.create() 결과의 id를 사용
  → 알림 워커:
    1. 해당 셀럽의 활성 Alert 규칙 조회
    2. 각 규칙의 threshold와 이벤트 impactScore 비교
    3. 조건 충족 시 채널별 알림 발송
    4. lastTriggeredAt 업데이트
```

concurrency: 1 (알림 순서 보장)

---

## 4. 알림 설정 API

```
GET  /api/alerts?celebrityId=xxx  → 알림 규칙 목록
POST /api/alerts                  → 알림 규칙 생성
PUT  /api/alerts/[id]             → 규칙 수정
DELETE /api/alerts/[id]           → 규칙 삭제
```

### 알림 설정 UI

관리자 페이지에 `/admin/alerts` 추가:
- 셀럽별 알림 규칙 목록
- 규칙 추가 다이얼로그 (셀럽 선택, 타입, 임계값, Telegram chat ID)
- 활성/비활성 토글
- 마지막 발동 시간 표시

---

## 5. 즐겨찾기

### API

```
GET  /api/settings/favorites    → 즐겨찾기 셀럽 ID 목록
POST /api/settings/favorites    → { celebrityId, action: "add" | "remove" }
```

### UI 변경

- **대시보드**: 즐겨찾기 셀럽을 상단에 별도 섹션으로 표시
- **셀럽 카드**: ⭐ 즐겨찾기 토글 버튼 추가
- **사이드바**: 즐겨찾기 셀럽 바로가기 (이름 목록)

---

## 6. 파일 구조

```
prisma/schema.prisma                     (수정) Alert, AppSetting 추가

src/workers/notifier/
├── telegram.ts                          (신규)
└── telegram.test.ts                     (신규)

src/workers/event-detector.ts            (수정) 알림 큐 연동
src/workers/index.ts                     (수정) ALERT 큐 + 워커
src/shared/lib/queue.ts                  (수정) ALERT 큐 추가

src/app/api/alerts/route.ts              (신규) CRUD
src/app/api/alerts/[id]/route.ts         (신규) PUT, DELETE
src/app/api/settings/favorites/route.ts  (신규)

src/app/(dashboard)/admin/alerts/page.tsx (신규)
src/app/(dashboard)/page.tsx             (수정) 즐겨찾기 섹션
src/entities/celebrity/ui/celebrity-card.tsx (수정) ⭐ 버튼
src/widgets/sidebar/index.tsx            (수정) 즐겨찾기 바로가기
```

---

## 7. 개발 순서

| Task | 내용 | 의존성 | 병렬 |
|------|------|--------|------|
| 1 | Prisma Alert + AppSetting 모델 | 없음 | - |
| 2 | Telegram 알림 발송기 | Task 1 | - |
| 3 | 알림 워커 + 이벤트 감지 연동 | Task 2 | - |
| 4 | 알림 설정 API + UI | Task 1 | Task 5와 병렬 |
| 5 | 즐겨찾기 기능 + 최종 정리 | Task 1 | Task 4와 병렬 |

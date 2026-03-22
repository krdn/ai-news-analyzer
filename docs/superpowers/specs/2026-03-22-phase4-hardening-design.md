# Phase 4: 고도화 — 설계 문서

## 개요

성능 최적화, 사용자 인증, PDF 리포트 생성, 관리자 대시보드 완성으로 프로덕션 수준의 앱을 완성한다.

## 범위

- DB 인덱스 + API 페이지네이션 + Redis 캐싱
- NextAuth.js 인증 (관리자/일반 역할)
- PDF 리포트 생성 (@react-pdf/renderer)
- 관리자 대시보드 확장 (시스템 현황, 로그, 통계)

---

## 1. 성능 최적화

### DB 인덱스 추가

```prisma
// 기존 인덱스 외 추가
model Comment {
  @@index([articleId, publishedAt])     // 기사별 시간순 댓글
  @@index([sentimentLabel, analysisDepth]) // 분석 상태 필터
}

model Article {
  @@index([sourceType, collectedAt])    // 소스별 최근 수집
}
```

### API 페이지네이션

모든 목록 API에 커서 기반 페이지네이션 추가:
```
GET /api/celebrities?cursor=xxx&limit=20
GET /api/events?cursor=xxx&limit=20
→ { data: [...], nextCursor: "xxx" | null }
```

cursor 없으면 기본 limit=50 적용 (성능 보호). `/api/compare`, `/api/settings/favorites`는 데이터가 소량이므로 페이지네이션 불필요.

### Redis 캐싱

```typescript
// src/shared/lib/cache.ts
export async function getCached<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T>;
export async function invalidateCache(pattern: string): Promise<void>;
```

캐시 대상:
| 키 | TTL | 용도 |
|---|-----|------|
| `dashboard:summary` | 5분 | 대시보드 요약 카드 |
| `celeb:{id}:sentiment` | 2분 | 셀럽 감성 데이터 |
| `celeb:{id}:events` | 5분 | 셀럽 이벤트 목록 |

스냅샷/이벤트 생성 시 관련 캐시 무효화.

### Prisma 쿼리 최적화

- 불필요한 `include` 제거, `select` 사용
- 댓글 조회 시 `take` 제한 (최대 100개)

---

## 2. 사용자 인증

### Auth.js v5 (next-auth@5) + Credentials Provider

Next.js 16 + App Router 호환을 위해 Auth.js v5 사용. JWT-only 세션 (DB 세션 불필요).

```prisma
model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  password  String   // bcrypt 해시
  name      String?
  role      String   @default("USER") // "ADMIN" | "USER"
  createdAt DateTime @default(now()) @map("created_at")

  @@map("users")
}
```

### 인증 흐름

- 로그인 페이지: `/login`
- 초기 관리자: 환경 변수 `ADMIN_EMAIL`, `ADMIN_PASSWORD`로 시드
- NextAuth session + JWT 토큰

### 라우트 보호

```
middleware.ts (Next.js 16):
├── /login, /api/auth/* → 공개
├── /admin/*, /api/crawl/*, /api/alerts/* → ADMIN만
└── 나머지 → 로그인 필요
```

### 환경 변수

```
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://192.168.0.5:3200"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD=""
```

---

## 3. PDF 리포트

### API

```
GET /api/report/[celebrityId]?days=30
→ Content-Type: application/pdf
```

### 리포트 내용

1. **헤더**: 셀럽 이름, 카테고리, 기간
2. **감성 요약**: 평균 점수, 긍정/중립/부정 비율, 총 댓글 수
3. **주제별 감성**: 테이블 (주제, 평균 점수, 댓글 수)
4. **주요 이벤트**: 최근 이벤트 목록 (날짜, 제목, 영향도, 전후 비교)
5. **소스별 통계**: 소스별 기사/댓글 수, 평균 감성

### 기술

- `@react-pdf/renderer` 서버사이드 PDF 생성
- 셀럽 상세 페이지에 "📄 리포트 다운로드" 버튼 추가

---

## 4. 관리자 대시보드 완성

### /admin 페이지 확장

기존 셀럽 CRUD에 시스템 현황 섹션 추가:

```
시스템 현황 카드:
├── 총 셀럽 수 | 총 기사 수 | 총 댓글 수 | 총 이벤트 수
├── 오늘 수집 기사 | 오늘 분석 댓글
└── 큐 상태 (대기/활성/실패)

최근 활동 로그:
├── 최근 크롤링 완료 (소스, 셀럽, 기사/댓글 수, 시간)
├── 최근 이벤트 감지
└── 최근 알림 발송

데이터 관리:
└── 오래된 기사 아카이브 (N일 이전 댓글 삭제) — 수동 트리거
```

### API

```
GET /api/admin/stats → 시스템 통계
POST /api/admin/cleanup → 데이터 정리 (days 파라미터, 최소 30일)
  - 하드 삭제 (comments → articles 순서)
  - 삭제 전 영향 건수 반환 (dry-run 모드 지원: ?dryRun=true)
  - ADMIN 역할만 접근 가능
```

---

## 5. 파일 구조

```
prisma/schema.prisma              (수정) User 모델 + 인덱스 추가

src/shared/lib/
├── cache.ts                      (신규) Redis 캐시 유틸
└── cache.test.ts                 (신규)

src/app/
├── login/page.tsx                (신규) 로그인 페이지
├── api/auth/[...nextauth]/route.ts (신규) Auth.js v5
├── api/report/[celebrityId]/route.ts (신규)
├── api/admin/stats/route.ts      (신규)
├── api/admin/cleanup/route.ts    (신규)
└── middleware.ts                      (신규) 라우트 보호

src/app/api/celebrities/route.ts  (수정) 페이지네이션
src/app/api/events/route.ts       (수정) 페이지네이션 + 캐싱
src/app/api/sentiment/*/route.ts  (수정) 캐싱

src/app/(dashboard)/
├── admin/page.tsx                (수정) 시스템 현황 추가
└── celebrity/[id]/page.tsx       (수정) PDF 다운로드 버튼
```

---

## 6. 개발 순서

| Task | 내용 | 의존성 | 병렬 |
|------|------|--------|------|
| 1 | Redis 캐시 유틸 | 없음 | Task 2와 병렬 |
| 2 | DB 인덱스 + 쿼리 최적화 | 없음 | Task 1과 병렬 |
| 3 | API 페이지네이션 | Task 1, 2 | - |
| 4 | User 모델 + NextAuth 인증 | 없음 | Task 1-3과 병렬 |
| 5 | middleware.ts 라우트 보호 | Task 4 | - |
| 6 | PDF 리포트 생성 | Task 3 | Task 5와 병렬 |
| 7 | 관리자 대시보드 확장 | Task 4 | Task 6과 병렬 |
| 8 | 로그인 UI + 최종 정리 | Task 5 | - |

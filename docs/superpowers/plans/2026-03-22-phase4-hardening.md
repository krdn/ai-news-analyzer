# Phase 4: 고도화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 성능 최적화, 사용자 인증, PDF 리포트, 관리자 대시보드로 프로덕션 수준 앱 완성

**Architecture:** Redis 캐싱 레이어 추가, Auth.js v5 JWT 인증, @react-pdf/renderer 서버사이드 PDF, 관리자 통계 API

**Tech Stack:** Auth.js v5 (next-auth@5), bcryptjs, @react-pdf/renderer, Redis 캐싱

**Spec:** `docs/superpowers/specs/2026-03-22-phase4-hardening-design.md`

---

## Task 1: Redis 캐시 유틸리티

**Files:**
- Create: `src/shared/lib/cache.ts`
- Create: `src/shared/lib/cache.test.ts`

- [ ] **Step 1: 캐시 유틸 테스트**

```typescript
// src/shared/lib/cache.test.ts
import { describe, it, expect, vi } from "vitest";
import { getCacheKey, parseCacheResult } from "./cache";

describe("캐시 유틸", () => {
  it("캐시 키를 생성한다", () => {
    expect(getCacheKey("celeb", "123", "sentiment")).toBe("celeb:123:sentiment");
  });

  it("JSON 캐시 결과를 파싱한다", () => {
    const data = { score: 0.5, label: "POSITIVE" };
    const result = parseCacheResult(JSON.stringify(data));
    expect(result).toEqual(data);
  });

  it("잘못된 JSON은 null 반환", () => {
    expect(parseCacheResult("invalid")).toBeNull();
    expect(parseCacheResult(null)).toBeNull();
  });
});
```

- [ ] **Step 2: 구현**

```typescript
// src/shared/lib/cache.ts
import { redis } from "./redis";

export function getCacheKey(...parts: string[]): string {
  return parts.join(":");
}

export function parseCacheResult(raw: string | null): unknown | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function getCached<T>(
  key: string, ttlSeconds: number, fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  const parsed = parseCacheResult(cached);
  if (parsed !== null) return parsed as T;

  const fresh = await fetcher();
  await redis.set(key, JSON.stringify(fresh), "EX", ttlSeconds);
  return fresh;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length > 0) await redis.del(...keys);
}
```

- [ ] **Step 3: 테스트 → 성공, 커밋**

```
feat: Redis 캐시 유틸리티

getCached/invalidateCache 함수
- TTL 기반 캐싱 + JSON 파싱

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Task 2: DB 인덱스 + Prisma 쿼리 최적화

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: 주요 API route 파일들 (select 최적화)

- [ ] **Step 1: 복합 인덱스 추가 + 마이그레이션**

Comment에 `@@index([articleId, publishedAt])` 추가 (기존 `@@index([articleId])` 대체).
Article에 `@@index([sourceType, collectedAt])` 추가.

```bash
pnpm prisma migrate dev --name add-performance-indexes
```

- [ ] **Step 2: API select 최적화**

주요 API에서 불필요한 필드 제거. 예: 댓글 목록 조회 시 `select` 사용.

- [ ] **Step 3: 커밋**

```
perf: DB 인덱스 추가 및 쿼리 최적화

복합 인덱스 추가, API select 필드 제한

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Task 3: API 페이지네이션

**Files:**
- Modify: `src/app/api/celebrities/route.ts`
- Modify: `src/app/api/events/route.ts`
- 캐싱 적용: sentiment, events API

- [ ] **Step 1: celebrities API에 커서 기반 페이지네이션**

```typescript
// ?cursor=xxx&limit=20 (기본 limit=50)
const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
const cursor = searchParams.get("cursor");

const celebrities = await prisma.celebrity.findMany({
  where,
  take: limit + 1,
  ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  orderBy: { createdAt: "desc" },
});

const hasNext = celebrities.length > limit;
const data = hasNext ? celebrities.slice(0, -1) : celebrities;
const nextCursor = hasNext ? data[data.length - 1].id : null;

return NextResponse.json({ data, nextCursor });
```

- [ ] **Step 2: events API에 페이지네이션 + 캐싱**

- [ ] **Step 3: sentiment API에 캐싱 적용**

```typescript
import { getCached, getCacheKey } from "@/shared/lib/cache";

const cacheKey = getCacheKey("celeb", celebrityId, "sentiment", period, String(days));
const result = await getCached(cacheKey, 120, async () => {
  // 기존 쿼리 로직
});
```

- [ ] **Step 4: 커밋**

```
perf: API 페이지네이션 및 Redis 캐싱 적용

커서 기반 페이지네이션 (기본 limit=50)
- sentiment/events API 캐싱 (2~5분 TTL)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Task 4: User 모델 + Auth.js v5 인증

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/auth.ts`

- [ ] **Step 1: 의존성 설치**

```bash
pnpm add next-auth@5 bcryptjs
pnpm add -D @types/bcryptjs
```

- [ ] **Step 2: User 모델 추가 + 마이그레이션**

```prisma
model User {
  id        String   @id @default(uuid()) @db.Uuid
  email     String   @unique
  password  String
  name      String?
  role      String   @default("USER")
  createdAt DateTime @default(now()) @map("created_at")
  @@map("users")
}
```

```bash
pnpm prisma migrate dev --name add-users
```

- [ ] **Step 3: Auth.js 설정**

```typescript
// src/lib/auth.ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/shared/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (credentials) => {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password as string, user.password);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = (user as any).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as any).role = token.role;
      return session;
    },
  },
  pages: { signIn: "/login" },
});
```

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 4: 관리자 시드 스크립트**

```typescript
// prisma/seed.ts
import bcrypt from "bcryptjs";
const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD!, 12);
await prisma.user.upsert({
  where: { email: process.env.ADMIN_EMAIL! },
  create: { email: process.env.ADMIN_EMAIL!, password: hash, name: "Admin", role: "ADMIN" },
  update: {},
});
```

- [ ] **Step 5: 커밋**

```
feat: Auth.js v5 사용자 인증

Credentials Provider + JWT 세션
- User 모델, 관리자 시드 스크립트
- 역할 기반 접근 제어 준비

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Task 5: middleware.ts 라우트 보호

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: 미들웨어 구현**

```typescript
// src/middleware.ts
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth"];
const ADMIN_PATHS = ["/admin", "/api/crawl", "/api/alerts", "/api/admin"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    if ((req.auth.user as any)?.role !== "ADMIN") {
      return NextResponse.json({ error: "관리자 권한 필요" }, { status: 403 });
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 2: 커밋**

```
feat: middleware.ts 라우트 보호

공개/인증/관리자 경로 분리
- 미인증 → /login 리다이렉트
- 관리자 경로 → ADMIN 역할 필요

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Task 6: PDF 리포트 생성

**Files:**
- Create: `src/app/api/report/[celebrityId]/route.ts`
- Modify: `src/app/(dashboard)/celebrity/[id]/page.tsx`

- [ ] **Step 1: 의존성**

```bash
pnpm add @react-pdf/renderer
```

- [ ] **Step 2: PDF API Route**

```typescript
// src/app/api/report/[celebrityId]/route.ts
import { renderToBuffer } from "@react-pdf/renderer";
// React PDF 문서 컴포넌트 정의 + 데이터 조회 + PDF 반환
// Content-Type: application/pdf
// Content-Disposition: attachment; filename="report-{name}-{date}.pdf"
```

리포트 내용: 헤더(셀럽/기간), 감성 요약(수치), 주제별 테이블, 이벤트 목록, 소스별 통계.

- [ ] **Step 3: 셀럽 상세 페이지에 다운로드 버튼**

- [ ] **Step 4: 커밋**

```
feat: PDF 리포트 생성

셀럽별 감성 분석 리포트 PDF 다운로드
- 감성 요약, 주제별 감성, 이벤트, 소스별 통계

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Task 7: 관리자 대시보드 확장

**Files:**
- Create: `src/app/api/admin/stats/route.ts`
- Create: `src/app/api/admin/cleanup/route.ts`
- Modify: `src/app/(dashboard)/admin/page.tsx`

- [ ] **Step 1: 통계 API**

```typescript
// GET /api/admin/stats
// 총 셀럽/기사/댓글/이벤트 수, 오늘 수집, 큐 상태
```

- [ ] **Step 2: 정리 API**

```typescript
// POST /api/admin/cleanup { days: number, dryRun?: boolean }
// days < 30이면 400 에러
// dryRun=true면 건수만 반환, false면 실제 삭제
```

- [ ] **Step 3: 관리자 페이지에 시스템 현황 카드 + 데이터 정리 UI**

- [ ] **Step 4: 커밋**

```
feat: 관리자 대시보드 확장

시스템 현황 카드 + 데이터 정리 도구
- 통계 API, 안전한 cleanup (최소 30일, dry-run)

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Task 8: 로그인 UI + 최종 정리

**Files:**
- Create: `src/app/login/page.tsx`
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: 로그인 페이지**

shadcn Card + Input + Button. email/password 폼. signIn("credentials") 호출.

- [ ] **Step 2: .env.example 업데이트**

```
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://192.168.0.5:3200"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD=""
```

- [ ] **Step 3: CLAUDE.md Phase 4 완료**

- [ ] **Step 4: 커밋**

```
feat: 로그인 페이지 및 Phase 4 완료

로그인 UI + 환경 변수 문서화
- 전체 프로젝트 완성

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## 실행 순서

| Task | 내용 | 의존성 | 병렬 |
|------|------|--------|------|
| 1 | Redis 캐시 유틸 | 없음 | Task 2, 4와 병렬 |
| 2 | DB 인덱스 + 쿼리 최적화 | 없음 | Task 1, 4와 병렬 |
| 3 | API 페이지네이션 + 캐싱 | Task 1, 2 | - |
| 4 | User 모델 + Auth.js | 없음 | Task 1, 2와 병렬 |
| 5 | middleware.ts 라우트 보호 | Task 4 | - |
| 6 | PDF 리포트 | Task 3 | Task 5, 7과 병렬 |
| 7 | 관리자 대시보드 | Task 4 | Task 5, 6과 병렬 |
| 8 | 로그인 UI + 정리 | Task 5 | - |

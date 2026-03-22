# AI News Analyzer — 셀럽 뉴스 감성 분석기

셀럽(정치인, 연예인, 기타)의 뉴스와 댓글을 수집하고 AI 감성 분석을 수행하는 웹 앱.

## 기술 스택
- Next.js 16 (App Router) + TypeScript
- Prisma 7 + PostgreSQL 16
- BullMQ + Redis 7 (잡 큐)
- shadcn/ui + Tailwind CSS 4 (다크 모드)
- Recharts (차트), SWR (데이터 페칭)
- Docker Compose (홈서버 배포)

## 구조 (FSD)
- `src/app/` — 라우팅만 (App Router)
- `src/widgets/` — 조합 컴포넌트 (sidebar, sentiment-chart, comment-feed)
- `src/features/` — 기능 단위 (sentiment-tracking)
- `src/entities/` — 비즈니스 엔티티 (celebrity, comment)
- `src/shared/` — 공유 리소스 (lib, config)
- `src/workers/` — 별도 컨테이너 워커 (crawler, analyzer, snapshot)
- `src/components/ui/` — shadcn/ui 컴포넌트

FSD 의존성: `app → widgets → features → entities → shared`

## 개발 명령어
```bash
pnpm dev --port 3200          # 개발 서버
pnpm vitest run               # 테스트
pnpm prisma migrate dev       # DB 마이그레이션
pnpm prisma studio            # DB GUI
docker compose up -d postgres redis  # DB/Redis 시작
```

## 포트
| 서비스 | 포트 |
|--------|------|
| App | 3200 |
| PostgreSQL | 5437 |
| Redis | 6382 |

## 환경 변수
`.env` 참조 (`.env.example`에 템플릿)
- `DATABASE_URL` — PostgreSQL 연결
- `REDIS_URL` — Redis 연결
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` — 네이버 검색 API

## 개발 단계
- Phase 1 (현재): 기반 + 네이버 뉴스 MVP ✅
- Phase 2: 소스 확장 + 심층 AI 분석
- Phase 3: 추적 & 비교 기능
- Phase 4: 고도화
